const socketIo = require('socket.io');
const Machine = require('../models/machine');
const MachineGPIO = require('../models/machineGPIO'); // REQUIRED: Added back to fix crash on connect

let io;
const connectedMachines = new Map(); // machine_id -> socket_id

function init(server) {
    console.log('🚀 INITIALIZING V4 SOCKET MANAGER');
    io = new socketIo.Server(server, {
        allowEIO3: true,
        pingTimeout: 20000,
        pingInterval: 10000,
        transports: ['websocket', 'polling'],
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.error(`[SOCKET] 🔌 New Connection: ${socket.id} (IP: ${socket.handshake.address})`);

        socket.on('register', async (data) => {
            console.error(`[SOCKET] 📩 Register Attempt from ${socket.id}:`, data);
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) { console.error('[SOCKET] JSON Parse Error:', data, e); }
            }
            const { machine_id, client_type } = data;

            if (machine_id) {
                if (client_type === 'web') {
                    socket.join(`machine_${machine_id}`);
                    console.error(`[SOCKET] Web client joined room for: ${machine_id}`);
                } else {
                    socket.machine_id = machine_id;
                    socket.is_machine = true;
                    connectedMachines.set(machine_id, socket.id);
                    console.error(`[SOCKET] Machine registered: ${machine_id} (sending config...)`);

                    try {
                        await Machine.update(
                            { is_connected: true, last_heartbeat: new Date() },
                            { where: { machine_id } }
                        );

                        io.to(`machine_${machine_id}`).emit('machine_update', {
                            machine_id,
                            is_connected: true,
                            last_heartbeat: new Date()
                        });

                        const gpios = await MachineGPIO.findAll({
                            where: { machine_id },
                            raw: true
                        });

                        socket.emit('config', JSON.stringify({ gpios: gpios }));
                        console.error(`[SOCKET] ✅ Sent config to ${machine_id}`);
                    } catch (err) {
                        console.error('[SOCKET] ❌ Register Error:', err);
                    }
                }
            }
        });

        // --- CRITICAL HANDLERS RESTORED ---

        // 1. Logs from Machine -> Browser
        socket.on('machine_log', (data) => {
            if (socket.machine_id) {
                // Ensure it's valid JSON if string
                let payload = data;
                if (typeof data === 'string') {
                    try { payload = JSON.parse(data); } catch (e) { }
                }
                // Broadcast to Web Clients in room
                io.to(`machine_${socket.machine_id}`).emit('machine_log', payload);
            }
        });

        // 2. Heartbeat (Status/GPIOs) from Machine -> Browser
        socket.on('heartbeat', async (data) => {
            if (socket.machine_id) {
                let payload = data;
                if (typeof data === 'string') {
                    try { payload = JSON.parse(data); } catch (e) { }
                }

                // Update DB Timestamp (Throttle saves if needed, or just every time)
                // For performance, maybe throttle this? But let's keep it simple for now.
                // Actually, let's NOT await DB here to avoid blocking the event loop on high-freq heartbeats.
                // Just update memory or do fire-and-forget DB update.
                Machine.update({ last_heartbeat: new Date() }, { where: { machine_id: socket.machine_id } }).catch(() => { });

                // Broadcast State to Web Clients
                io.to(`machine_${socket.machine_id}`).emit('machine_update', {
                    machine_id: socket.machine_id,
                    last_heartbeat: new Date(),
                    is_connected: true,
                    ...payload // Spread states, network, sequence status
                });
            }
        });

        socket.on('disconnect', async (reason) => {
            console.error(`[SOCKET] ❌ Disconnected: ${socket.id}, Reason: ${reason}`);
            if (socket.machine_id && socket.is_machine) {
                console.error(`[SOCKET] Machine Offline: ${socket.machine_id}`);
                connectedMachines.delete(socket.machine_id);
                try {
                    await Machine.update({ is_connected: false }, { where: { machine_id: socket.machine_id } });
                    io.to(`machine_${socket.machine_id}`).emit('machine_update', { machine_id: socket.machine_id, is_connected: false });
                } catch (err) { console.error("[SOCKET] Disconnect DB Error", err); }
            }
        });
    });

    return io;
}

function sendCommand(machine_id, event, data) {
    const socketId = connectedMachines.get(machine_id);
    if (socketId && io) {
        io.to(socketId).emit(event, data);
        return true;
    }
    return false;
}



module.exports = { init, sendCommand };
