const Machine = require('../models/machine');
const MachineGPIO = require('../models/machineGPIO');
const MachineSequence = require('../models/machineSequence');
const MachineLog = require('../models/machineLog');
const Transaction = require('../models/transaction');
const socketManager = require('../utils/socketManager');

exports.controlCenter = async (req, res) => {
    try {
        const { machine_id } = req.params;
        const machine = await Machine.findOne({
            where: { machine_id },
            include: [
                { model: MachineGPIO, as: 'gpios' },
                { model: MachineSequence, as: 'sequences' }
            ],
            order: [
                [{ model: MachineSequence, as: 'sequences' }, 'step_index', 'ASC']
            ]
        });

        if (!machine) {
            return res.status(404).send('Machine not found');
        }

        // Security: Owner can only see their own machines
        if (req.session.user.role !== 'admin' && machine.owner_id !== req.session.user.id) {
            return res.redirect('/');
        }

        // Convert to plain object to ensure EJS can serialize it cleanly
        const machinePlain = machine.get({ plain: true });

        let dataSeeded = false;

        // 1. Seed Default GPIOs if none exist
        if (!machinePlain.gpios || machinePlain.gpios.length === 0) {
            console.log(`[Controller] Seeding default GPIOs for ${machine_id}`);
            const defaultPins = [
                { pin_number: 4, label: 'GPIO 4', is_active_low: true },
                { pin_number: 5, label: 'GPIO 5', is_active_low: true },
                { pin_number: 16, label: 'GPIO 16', is_active_low: true },
                { pin_number: 17, label: 'GPIO 17', is_active_low: true },
                { pin_number: 18, label: 'GPIO 18', is_active_low: true },
                { pin_number: 19, label: 'GPIO 19', is_active_low: true },
                { pin_number: 21, label: 'GPIO 21', is_active_low: true },
                { pin_number: 22, label: 'GPIO 22', is_active_low: true },
                { pin_number: 23, label: 'GPIO 23', is_active_low: true },
                { pin_number: 25, label: 'GPIO 25', is_active_low: true },
                { pin_number: 26, label: 'GPIO 26', is_active_low: true },
                { pin_number: 27, label: 'GPIO 27', is_active_low: true },
                { pin_number: 32, label: 'GPIO 32', is_active_low: true },
                { pin_number: 33, label: 'GPIO 33', is_active_low: true }
            ];
            await MachineGPIO.bulkCreate(defaultPins.map(p => ({ ...p, machine_id })));
            dataSeeded = true;
        }

        // 2. Seed Default Sequence if none exist
        if (!machinePlain.sequences || machinePlain.sequences.length === 0) {
            console.log(`[Controller] Seeding default Sequence for ${machine_id}`);
            const defaultSequence = [
                { step_index: 1, pin_number: 16, action: 'ON', duration_ms: 2000, description: 'Step 1' },
                { step_index: 2, pin_number: 17, action: 'ON', duration_ms: 3000, description: 'Step 2' },
                { step_index: 3, pin_number: 18, action: 'ON', duration_ms: 3000, description: 'Step 3' },
                { step_index: 4, pin_number: 16, action: 'OFF', duration_ms: 500, description: 'Stop 1' },
                { step_index: 5, pin_number: 17, action: 'OFF', duration_ms: 500, description: 'Stop 2' },
                { step_index: 6, pin_number: 18, action: 'OFF', duration_ms: 500, description: 'Stop 3' }
            ];
            await MachineSequence.bulkCreate(defaultSequence.map(s => ({ ...s, machine_id })));
            dataSeeded = true;
        }

        // If we seeded anything, reload the full machine object
        if (dataSeeded) {
            const updatedMachine = await Machine.findOne({
                where: { machine_id },
                include: [
                    { model: MachineGPIO, as: 'gpios' },
                    { model: MachineSequence, as: 'sequences' }
                ],
                order: [
                    [{ model: MachineSequence, as: 'sequences' }, 'step_index', 'ASC']
                ]
            });
            Object.assign(machinePlain, updatedMachine.get({ plain: true }));
        }

        // Robust Parsing for Network Info (handle double-stringification)
        if (machinePlain.network_info) {
            let parsed = machinePlain.network_info;
            while (typeof parsed === 'string') {
                try {
                    parsed = JSON.parse(parsed);
                } catch (e) {
                    parsed = {};
                    break;
                }
            }
            machinePlain.network_info = parsed || {};
        } else {
            machinePlain.network_info = {};
        }

        // Ensure Arrays
        if (!Array.isArray(machinePlain.gpios)) machinePlain.gpios = [];
        if (!Array.isArray(machinePlain.sequences)) machinePlain.sequences = [];

        console.log(`[Controller] Machine Data Ready: ${machinePlain.machine_id}`);
        console.log(`   - GPIOs: ${machinePlain.gpios ? machinePlain.gpios.length : 0}`);
        console.log(`   - Sequences: ${machinePlain.sequences ? machinePlain.sequences.length : 0}`);

        // Fetch Recent Transactions
        const recentTransactions = await Transaction.findAll({
            where: {
                machine_id: machine_id,
                payment_status: 'captured'
            },
            order: [['event_time', 'DESC']],
            limit: 5,
            raw: true
        });

        // Prepare Frontend Data (Safe Injection)
        const frontendData = {
            machine_id: machinePlain.machine_id || '',
            machine_name: machinePlain.machine_name || '',
            connected: !!machinePlain.is_connected,
            runningSequence: !!machinePlain.is_running_sequence,
            networkInfo: machinePlain.network_info || {},
            gpios: machinePlain.gpios || [],
            sequences: machinePlain.sequences || [],
            transactions: recentTransactions || [],
            last_heartbeat: machinePlain.last_heartbeat
        };

        // Encode data to Base64 to prevent EJS/Formatter syntax conflicts in the view
        const frontendDataEncoded = Buffer.from(JSON.stringify(frontendData)).toString('base64');

        console.log('Frontend Data (Encoded):', frontendDataEncoded.substring(0, 50) + '...');
        res.render('control/machine', { machine: machinePlain, recentTransactions: recentTransactions, frontendData, frontendDataEncoded });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading control panel');
    }
};

exports.toggleGPIO = async (req, res) => {
    try {
        const { machine_id } = req.params;
        const { pin, action } = req.body;
        const user = req.session.user; // Get user from session

        let payload = {};
        if (action) payload = { action };
        else payload = { pin: parseInt(pin) };

        const success = socketManager.sendCommand(machine_id, 'toggle_gpio', payload);

        if (success) {
            await MachineLog.create({
                machine_id,
                user_id: user ? user.id : null,
                triggered_by: user ? user.username : 'Unknown',
                action_type: 'gpio_toggle',
                description: `Pin ${pin} set to ${action}`,
                status: 'success'
            });
        }

        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.pulseGPIO = async (req, res) => {
    try {
        const { machine_id } = req.params;
        const { pin, duration } = req.body;
        const user = req.session.user; // Get user from session

        const success = socketManager.sendCommand(machine_id, 'pulse_gpio', {
            pin: parseInt(pin),
            duration: parseInt(duration) || 5000
        });

        if (success) {
            await MachineLog.create({
                machine_id,
                user_id: user ? user.id : null,
                triggered_by: user ? user.username : 'Unknown',
                action_type: 'gpio_pulse',
                description: `Pin ${pin} pulsed for ${duration}ms`,
                status: 'success'
            });
        }

        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.runSequence = async (req, res) => {
    try {
        const { machine_id } = req.params;
        const { transaction_id } = req.body; // Added transaction_id
        const user = req.session.user; // Get user from session

        const sequences = await MachineSequence.findAll({
            where: { machine_id },
            order: [['step_index', 'ASC']]
        });

        if (sequences.length === 0) {
            return res.status(400).json({ error: 'No sequence defined for this machine' });
        }

        const success = socketManager.sendCommand(machine_id, 'run_sequence', { steps: sequences });

        if (success) {
            await Machine.update({ is_running_sequence: true }, { where: { machine_id } });

            // LOGGING
            const logDescription = transaction_id
                ? `Sequence triggered by Transaction ${transaction_id}`
                : 'Manual sequence run from control panel';

            await MachineLog.create({
                machine_id,
                user_id: user ? user.id : null,
                triggered_by: user ? user.username : 'Manual Operator',
                action_type: transaction_id ? 'payment_trigger' : 'manual_trigger',
                description: logDescription,
                status: 'success',
                transaction_id: transaction_id || null
            });

            // Update Transaction if applicable
            if (transaction_id) {
                await Transaction.update({
                    trigger_status: 'processed',
                    trigger_source: 'manual', // Assuming manual trigger from control panel for now
                    triggered_by: user ? user.username : 'Manual Operator',
                    processed_at: new Date()
                }, {
                    where: { razorpay_payment_id: transaction_id }
                });
            }
        }

        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateGPIOConfig = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized: Only admins can edit hardware pinout' });
        }
        const { machine_id } = req.params;
        const { gpios } = req.body; // Array of { pin_number, label }
        const user = req.session.user;

        await MachineGPIO.destroy({ where: { machine_id } });
        await MachineGPIO.bulkCreate(gpios.map(g => ({ ...g, machine_id })));

        // Notify machine with FULL configuration immediately
        const fullGpios = await MachineGPIO.findAll({ where: { machine_id } });
        socketManager.sendCommand(machine_id, 'config', JSON.stringify({ gpios: fullGpios }));

        await MachineLog.create({
            machine_id,
            user_id: user ? user.id : null,
            triggered_by: user ? user.username : 'Admin',
            action_type: 'gpio_config_update',
            description: `GPIO configuration updated. ${gpios.length} pins configured.`,
            status: 'success'
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateSequenceConfig = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized: Only admins can edit sequences' });
        }
        const { machine_id } = req.params;
        const { sequences } = req.body; // Array of steps
        const user = req.session.user;

        await MachineSequence.destroy({ where: { machine_id } });

        console.log(`[Controller] Updating Sequence for ${machine_id}. Input items: ${sequences.length}`);

        const stepsToCreate = sequences.map((s, index) => ({
            machine_id,
            step_index: index + 1,
            // For global actions, pin_number is irrelevant (null). Otherwise, parse it.
            pin_number: (s.action === 'ALL_ON' || s.action === 'ALL_OFF') ? null : (parseInt(s.pin_number) || 0),
            action: s.action,
            duration_ms: parseInt(s.duration_ms) || 0,
            description: s.description
        }));

        // Log the first item to verify structure
        if (stepsToCreate.length > 0) {
            console.log('[Controller] First step sample:', stepsToCreate[0]);
        }

        await MachineSequence.bulkCreate(stepsToCreate);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.emergencyStop = async (req, res) => {
    try {
        const { machine_id } = req.params;
        // Broadcast to machine and update DB state
        const success = socketManager.sendCommand(machine_id, 'emergency_stop', {});

        if (success) {
            await Machine.update({ is_running_sequence: false }, { where: { machine_id } });
        }

        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const { machine_id, action_type } = req.query;

        let where = {};
        if (req.session.user.role === 'owner') {
            const ownedMachines = await Machine.findAll({
                where: { owner_id: req.session.user.id },
                attributes: ['machine_id']
            });
            where.machine_id = ownedMachines.map(m => m.machine_id);
        }

        if (machine_id) where.machine_id = machine_id;
        if (action_type) where.action_type = action_type;

        const { count, rows: logs } = await MachineLog.findAndCountAll({
            where,
            include: [{ model: Machine, attributes: ['machine_name', 'location'] }],
            order: [['timestamp', 'DESC']],
            limit,
            offset
        });

        res.render('admin/logs', {
            logs,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            query: req.query,
            title: 'System Activity Logs'
        });
    } catch (error) {
        res.status(500).render('error', { message: error.message });
    }
};

exports.reconnectWifi = async (req, res) => {
    try {
        const { machine_id } = req.params;
        const success = socketManager.sendCommand(machine_id, 'reconnect_wifi', {});
        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.otaUpdate = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized: Only admins can push OTA updates' });
        }
        const { machine_id } = req.params;
        if (!req.file) {
            return res.status(400).json({ error: 'No firmware file uploaded' });
        }

        let host = req.get('host');

        // If developer is on localhost, we MUST use the local IP so ESP32 can reach it
        if (host.includes('localhost') || host.includes('127.0.0.1')) {
            const os = require('os');
            const nets = os.networkInterfaces();
            for (const name of Object.keys(nets)) {
                for (const net of nets[name]) {
                    if (net.family === 'IPv4' && !net.internal) {
                        host = `${net.address}:${process.env.PORT || 3000}`;
                        break;
                    }
                }
            }
        }

        const firmwareUrl = `${req.protocol}://${host}/uploads/ota/${req.file.filename}`;
        console.log(`[OTA] Starting update for ${machine_id} -> ${firmwareUrl}`);

        const success = socketManager.sendCommand(machine_id, 'ota_update', { url: firmwareUrl });

        res.json({ success, message: success ? 'OTA Command Sent' : 'Machine offline' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
