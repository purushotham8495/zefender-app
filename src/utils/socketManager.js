const socketIo = require('socket.io');
const Machine = require('../models/machine');
const MachineGPIO = require('../models/machineGPIO'); // REQUIRED: Added back to fix crash on connect
const MachineLog = require('../models/machineLog');

let io;
const connectedMachines = new Map(); // machine_id -> socket_id

const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const LOG_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'device.log');

function appendToLogFile(machineId, message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${machineId}] ${message}\n`;
    fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) console.error('Failed to write to log file:', err);
    });
}

/**
 * Socket.IO Initialization
 */
io = new socketIo.Server(server, {
    allowEIO3: true,
    pingTimeout: 60000, // Increased to 60s to prevent flaky disconnects
    pingInterval: 25000, // Reduced frequency to save bandwidth/processing
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

                // CRITICAL FIX: Always update the map with the NEWEST socket
                // Even if an old one exists, this new one is now authoritative
                connectedMachines.set(machine_id, socket.id);
                console.error(`[SOCKET] Machine registered: ${machine_id} (Socket ID: ${socket.id})`);

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

    // 1. Logs from Machine -> Browser (AND NOW DATABASE + FILE + CONSOLE)
    socket.on('machine_log', async (data) => {
        if (socket.machine_id) {
            // Ensure it's valid JSON if string
            let payload = data;
            let message = "";
            if (typeof data === 'string') {
                try {
                    payload = JSON.parse(data);
                    message = payload.message || data;
                } catch (e) {
                    message = data;
                }
            } else {
                message = data.message || JSON.stringify(data);
            }

            // 1. Console Log (Immediate Visibility)
            console.log(`[REMOTE-SERIAL] ${socket.machine_id}: ${message}`);

            // 2. File Log (Persistent Text File)
            appendToLogFile(socket.machine_id, message);

            // 3. Broadcast to Web Clients in room
            io.to(`machine_${socket.machine_id}`).emit('machine_log', payload);

            // 4. DB Persistence
            try {
                await MachineLog.create({
                    machine_id: socket.machine_id,
                    user_id: null,
                    triggered_by: 'Device',
                    action_type: 'device_log',
                    description: message,
                    status: 'success',
                    timestamp: new Date()
                });
            } catch (err) {
                console.error('[SOCKET] Failed to save device log:', err);
            }
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

            // CRITICAL FIX: Only remove from map if THIS socket is the one in the map
            // This prevents race conditions where a NEW connection has already registered
            const currentSocketId = connectedMachines.get(socket.machine_id);
            if (currentSocketId === socket.id) {
                console.error(`[SOCKET] Machine Offline (Confirmed): ${socket.machine_id}`);
                connectedMachines.delete(socket.machine_id);

                try {
                    await Machine.update({ is_connected: false }, { where: { machine_id: socket.machine_id } });
                    io.to(`machine_${socket.machine_id}`).emit('machine_update', { machine_id: socket.machine_id, is_connected: false });
                } catch (err) { console.error("[SOCKET] Disconnect DB Error", err); }
            } else {
                console.error(`[SOCKET] Disconnect ignored for ${socket.machine_id} (Newer connection ${currentSocketId} is active)`);
            }
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
    console.error(`[SOCKET] Command failed for ${machine_id}: Machine not in connected map.`);
    return false;
}

}

module.exports = { init, sendCommand };
