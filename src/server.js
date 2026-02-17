const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
const compression = require('compression');
const morgan = require('morgan');
const sequelize = require('./config/database');
const apiRoutes = require('./routes/api');
// const webRoutes = require('./routes/web'); // Pending

dotenv.config();

const http = require('http');
const socketManager = require('./utils/socketManager');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize WebSockets
socketManager.init(server);

// Security and Performance Middleware
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "code.jquery.com", "cdnjs.cloudflare.com", "unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com", "unpkg.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "fonts.googleapis.com", "fonts.gstatic.com"],
            connectSrc: ["'self'", "ws:", "wss:", "https:", "http:", "unpkg.com"]
        }
    }
}));

app.use(cors());
app.use(compression());
// Use 'combined' format for production (Apache-style), 'dev' for development
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cookieParser());

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Body Parser
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true }));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const webRoutes = require('./routes/web');
app.use('/api', apiRoutes);
app.use('/', webRoutes);

// CSRF & Error Handling
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        // Handle CSRF token errors here
        console.warn('CSRF Token Mismatch/Missing:', req.url);
        if (req.url === '/login') {
            return res.render('login', { error: 'Your session has expired. Please try again.' });
        }
        // For other routes, redirect back if possible
        const backURL = req.header('Referer') || '/';
        return res.redirect(backURL);
    }

    console.error('Unhandled Error:', err);
    res.status(err.status || 500).send(err.message || 'Internal Server Error');
});

// Database Sync
sequelize.sync().then(async () => {
    console.log('Database synced');

    // Manual Migration for Transactions & Logs Table
    try {
        // 1. Check Transactions
        const [txCols] = await sequelize.query("SHOW COLUMNS FROM transactions LIKE 'trigger_status'");
        if (txCols.length === 0) {
            console.log('Migrating transactions table: Adding governance columns...');
            await sequelize.query("ALTER TABLE transactions ADD COLUMN trigger_status ENUM('pending', 'processed', 'failed') DEFAULT 'pending'");
            await sequelize.query("ALTER TABLE transactions ADD COLUMN trigger_source ENUM('webhook', 'manual') DEFAULT 'webhook'");
            await sequelize.query("ALTER TABLE transactions ADD COLUMN triggered_by VARCHAR(255) NULL");
            await sequelize.query("ALTER TABLE transactions ADD COLUMN processed_at DATETIME NULL");
            console.log('✅ Transactions table migration complete');
        }

        // 3. Check Machines (Primary Sequence Column)
        const [machineCols] = await sequelize.query("SHOW COLUMNS FROM machines LIKE 'primary_sequence_id'");
        if (machineCols.length === 0) {
            console.log('Migrating machines table: Adding primary_sequence_id...');
            await sequelize.query("ALTER TABLE machines ADD COLUMN primary_sequence_id VARCHAR(255) DEFAULT 'DB_DEFAULT'");
            console.log('✅ Machines table migration complete');
        }

        const [qrCols] = await sequelize.query("SHOW COLUMNS FROM machines LIKE 'test_qr_url'");
        if (qrCols.length === 0) {
            console.log('Migrating machines table: Adding QR URL columns...');
            await sequelize.query("ALTER TABLE machines ADD COLUMN test_qr_url VARCHAR(255) NULL");
            await sequelize.query("ALTER TABLE machines ADD COLUMN actual_qr_url VARCHAR(255) NULL");
            console.log('✅ Machines table QR columns added');
        }

        // 2. Check/Create MachineLogs
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS machine_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                machine_id VARCHAR(255) NOT NULL,
                user_id INT NULL,
                triggered_by VARCHAR(255) NOT NULL,
                action_type ENUM('payment_trigger', 'manual_trigger', 'test_run', 'gpio_toggle', 'gpio_pulse', 'gpio_config_update', 'emergency_stop', 'ota_update') NOT NULL,
                description VARCHAR(255) NULL,
                status ENUM('success', 'failed') DEFAULT 'success',
                transaction_id VARCHAR(255) NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (machine_id),
                INDEX (transaction_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Machine logs table verified/created');
    } catch (err) {
        console.warn('Migration task completed with warnings:', err.message);
    }

    // Reset all machine connection statuses to false on startup
    const Machine = require('./models/machine');
    await Machine.update({ is_connected: false }, { where: {} });
    console.log('🔄 All machine statuses reset to disconnected');

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        console.log('--- Network Info ---');
        for (const interfaceName in networkInterfaces) {
            for (const details of networkInterfaces[interfaceName]) {
                if (details.family === 'IPv4' && !details.internal) {
                    console.log(`📡 Local IP (${interfaceName}): ${details.address}`);
                }
            }
        }
    });
}).catch(err => console.error('Database connection error:', err));
