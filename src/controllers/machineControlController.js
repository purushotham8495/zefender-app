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

        // Fetch Recent Logs (NEW)
        const recentLogs = await MachineLog.findAll({
            where: { machine_id },
            order: [['timestamp', 'DESC']],
            limit: 50,
            raw: true
        });

        // Prepare Frontend Data (Safe Injection)
        const frontendData = {
            id: machinePlain.id,
            machine_id: machinePlain.machine_id || '',
            machine_name: machinePlain.machine_name || '',
            connected: !!machinePlain.is_connected,
            runningSequence: !!machinePlain.is_running_sequence,
            networkInfo: machinePlain.network_info || {},
            gpios: machinePlain.gpios || [],
            sequences: machinePlain.sequences || [],
            primary_sequence_id: machinePlain.primary_sequence_id || 'DB_DEFAULT',
            transactions: recentTransactions || [],
            recentLogs: recentLogs.map(l => ({
                time: l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : '',
                message: l.description || ''
            })) || [],
            test_qr_url: machinePlain.test_qr_url,
            actual_qr_url: machinePlain.actual_qr_url,
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
            const description = action
                ? `Global Action: ${action}`
                : `Pin ${pin} toggled`;

            await MachineLog.create({
                machine_id,
                user_id: user ? user.id : null,
                triggered_by: user ? user.username : 'Unknown',
                action_type: 'gpio_toggle',
                description: description,
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
        const { transaction_id, sequence_id } = req.body; // Added sequence_id support
        const user = req.session.user;

        // Fetch the machine to check its Primary Sequence setting
        const machine = await Machine.findOne({ where: { machine_id } });
        if (!machine) return res.status(404).json({ error: 'Machine not found' });

        // DETERMINE WHICH SEQUENCE TO RUN
        // Priority: 
        // 1. Manually passed sequence_id (from clicking a specific button)
        // 2. Machine's set Primary Sequence (for transactions)
        // 3. Fallback to Cloud steps (DB_DEFAULT)
        const targetSeqId = sequence_id || machine.primary_sequence_id || 'DB_DEFAULT';

        let success = false;
        let logDescription = "";

        if (targetSeqId === 'DB_DEFAULT') {
            const sequences = await MachineSequence.findAll({
                where: { machine_id },
                order: [['step_index', 'ASC']]
            });
            if (sequences.length === 0) return res.status(400).json({ error: 'No cloud sequence defined' });
            success = socketManager.sendCommand(machine_id, 'run_sequence', { steps: sequences });
            logDescription = transaction_id ? `Cloud Seq triggered by Tx ${transaction_id}` : 'Manual Cloud Seq Run';
        } else {
            // Trigger Local sequence by ID
            success = socketManager.sendCommand(machine_id, 'run_sequence', { sequence_id: targetSeqId });
            logDescription = transaction_id ? `Local Seq (${targetSeqId}) triggered by Tx ${transaction_id}` : `Manual Local Seq (${targetSeqId}) Run`;
        }

        if (success) {
            await Machine.update({ is_running_sequence: true }, { where: { machine_id } });

            await MachineLog.create({
                machine_id,
                user_id: user ? user.id : null,
                triggered_by: user ? user.username : (transaction_id ? 'Payment Gateway' : 'System'),
                action_type: transaction_id ? 'payment_trigger' : 'manual_trigger',
                description: logDescription,
                status: 'success',
                transaction_id: transaction_id || null
            });

            if (transaction_id) {
                await Transaction.update({
                    trigger_status: 'processed',
                    trigger_source: user ? 'manual' : 'webhook',
                    triggered_by: user ? user.username : 'Payment Gateway',
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
        const { machine_id, action_type, search } = req.query;
        const { Op } = require('sequelize');

        let where = {};
        if (req.session.user.role === 'owner') {
            const ownedMachines = await Machine.findAll({
                where: { owner_id: req.session.user.id },
                attributes: ['machine_id']
            });
            const ownedIds = ownedMachines.map(m => m.machine_id);

            if (machine_id) {
                // If filtering by specific machine, ensure it belongs to owner
                if (ownedIds.includes(machine_id)) {
                    where.machine_id = machine_id;
                } else {
                    where.machine_id = []; // Force no results
                }
            } else {
                where.machine_id = { [Op.in]: ownedIds };
            }
        } else if (machine_id) {
            where.machine_id = machine_id;
        }

        if (action_type) where.action_type = action_type;

        if (search) {
            where[Op.or] = [
                { description: { [Op.like]: `%${search}%` } },
                { triggered_by: { [Op.like]: `%${search}%` } },
                { machine_id: { [Op.like]: `%${search}%` } },
                { action_type: { [Op.like]: `%${search}%` } },
                // Search in related Machine model
                { '$Machine.machine_name$': { [Op.like]: `%${search}%` } },
                { '$Machine.location$': { [Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows: logs } = await MachineLog.findAndCountAll({
            where,
            include: [{ model: Machine, attributes: ['machine_name', 'location'] }],
            order: [['timestamp', 'DESC']],
            limit,
            offset,
            subQuery: false // Required for searching in joined tables with limits
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
    const { machine_id } = req.params;
    try {
        console.log(`[OTA] Request received for machine: ${machine_id}`);

        if (req.session.user.role !== 'admin' && req.session.user.role !== 'owner') {
            return res.status(403).json({ error: 'Unauthorized: Insufficient permissions for OTA update' });
        }

        if (!req.file) {
            console.error('[OTA] No file found in request');
            return res.status(400).json({ error: 'No firmware file detected. Please select a .bin file.' });
        }

        let host = req.get('host');
        console.log(`[OTA] Current Host: ${host}`);

        // Handle localhost/ngrok/production host detection
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

        // ESP32 handles http better than https for raw file downloads
        const protocol = host.includes('zefender.com') ? 'https' : 'http';
        const firmwareUrl = `${protocol}://${host}/uploads/ota/${req.file.filename}`;

        console.log(`[OTA] Firmware URL generated: ${firmwareUrl}`);

        const success = socketManager.sendCommand(machine_id, 'ota_update', {
            url: firmwareUrl,
            machine_id: machine_id,
            timestamp: new Date().toISOString()
        });

        if (success) {
            console.log(`[OTA] Command successfully emitted to socket for ${machine_id}`);
            res.json({ success: true, message: 'OTA deployment command sent successfully. Machine should restart within 60 seconds.' });
        } else {
            console.warn(`[OTA] Failed to send command: Machine ${machine_id} is currently offline.`);
            res.status(503).json({ success: false, error: 'Machine is currently offline. Please ensure it is connected before attempting update.' });
        }
    } catch (error) {
        console.error('[OTA] Controller Error:', error);
        res.status(500).json({ error: 'Internal Server Error: ' + error.message });
    }
};

exports.updatePrimarySequence = async (req, res) => {
    try {
        const { machine_id } = req.params;
        const { primary_sequence_id } = req.body;

        await Machine.update({ primary_sequence_id }, { where: { machine_id } });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.exportLogs = async (req, res) => {
    try {
        const { machine_id, action_type, search } = req.query;
        const { Op } = require('sequelize');

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

        if (search) {
            where[Op.or] = [
                { description: { [Op.like]: `%${search}%` } },
                { triggered_by: { [Op.like]: `%${search}%` } }
            ];
        }

        const logs = await MachineLog.findAll({
            where,
            include: [{ model: Machine, attributes: ['machine_name'] }],
            order: [['timestamp', 'DESC']],
            raw: true,
            nest: true
        });

        const { Parser } = require('json2csv');
        const fields = [
            { label: 'Timestamp', value: 'timestamp' },
            { label: 'Machine ID', value: 'machine_id' },
            { label: 'Machine Name', value: 'Machine.machine_name' },
            { label: 'Action Type', value: 'action_type' },
            { label: 'Description', value: 'description' },
            { label: 'Triggered By', value: 'triggered_by' },
            { label: 'Status', value: 'status' },
            { label: 'Transaction ID', value: 'transaction_id' }
        ];

        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(logs);

        res.header('Content-Type', 'text/csv');
        res.attachment(`machine_logs_${Date.now()}.csv`);
        return res.send(csv);

    } catch (error) {
        console.error(error);
        res.status(500).send('Error exporting logs: ' + error.message);
    }
};

exports.exportLogsXLSX = async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const { machine_id, action_type, search } = req.query;
        const { Op } = require('sequelize');

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
        if (search) {
            where[Op.or] = [
                { description: { [Op.like]: `%${search}%` } },
                { triggered_by: { [Op.like]: `%${search}%` } }
            ];
        }

        const logs = await MachineLog.findAll({
            where,
            include: [{ model: Machine, attributes: ['machine_name'] }],
            order: [['timestamp', 'DESC']]
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('System Logs');

        worksheet.columns = [
            { header: 'Timestamp', key: 'timestamp', width: 25 },
            { header: 'Machine ID', key: 'machine_id', width: 20 },
            { header: 'Machine Name', key: 'machine_name', width: 20 },
            { header: 'Action Type', key: 'action_type', width: 15 },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Triggered By', key: 'triggered_by', width: 20 },
            { header: 'Status', key: 'status', width: 10 },
            { header: 'TX ID', key: 'transaction_id', width: 20 }
        ];

        logs.forEach(l => {
            worksheet.addRow({
                timestamp: l.timestamp,
                machine_id: l.machine_id,
                machine_name: l.Machine ? l.Machine.machine_name : 'N/A',
                action_type: l.action_type,
                description: l.description,
                triggered_by: l.triggered_by,
                status: l.status,
                transaction_id: l.transaction_id || 'N/A'
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=logs_${Date.now()}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        res.status(500).send('Error exporting logs XLSX: ' + error.message);
    }
};

exports.exportLogsPDF = async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const { machine_id, action_type, search } = req.query;
        const { Op } = require('sequelize');

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
        if (search) {
            where[Op.or] = [
                { description: { [Op.like]: `%${search}%` } },
                { triggered_by: { [Op.like]: `%${search}%` } }
            ];
        }

        const logs = await MachineLog.findAll({
            where,
            include: [{ model: Machine, attributes: ['machine_name'] }],
            order: [['timestamp', 'DESC']]
        });

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=logs_${Date.now()}.pdf`);

        doc.pipe(res);
        doc.fontSize(20).text('System Activity Logs', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        const startX = 30;
        let currentY = doc.y;

        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Time', startX, currentY);
        doc.text('Machine', startX + 130, currentY);
        doc.text('Action', startX + 230, currentY);
        doc.text('Triggered By', startX + 330, currentY);
        doc.text('Status', startX + 480, currentY);

        doc.moveDown();
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(startX, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica').fontSize(8);
        logs.forEach(l => {
            if (doc.y > 750) doc.addPage();
            currentY = doc.y;
            doc.text(new Date(l.timestamp).toLocaleString(), startX, currentY);
            doc.text(l.Machine ? l.Machine.machine_name.substring(0, 15) : l.machine_id.substring(0, 15), startX + 130, currentY);
            doc.text(l.action_type.substring(0, 15), startX + 230, currentY);
            doc.text(l.triggered_by.substring(0, 20), startX + 330, currentY);
            doc.text(l.status, startX + 480, currentY);
            doc.moveDown();
            doc.fontSize(7).fillColor('#666666').text(`Desc: ${l.description.substring(0, 100)}`, startX + 20, currentY + 10);
            doc.fillColor('#000000').fontSize(8);
            doc.moveDown(0.5);
        });

        doc.end();
    } catch (error) {
        console.error(error);
        res.status(500).send('Error exporting logs PDF: ' + error.message);
    }
};
