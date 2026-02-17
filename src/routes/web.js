const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const machineController = require('../controllers/machineController');
const transactionController = require('../controllers/transactionController');
const userController = require('../controllers/userController');
const analyticsController = require('../controllers/analyticsController');
const profileController = require('../controllers/profileController');
const { isAuthenticated } = require('../middleware/auth');
const csrf = require('csurf');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Multer Config for OTA
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../public/uploads/ota');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `firmware_${Date.now()}.bin`);
    }
});
const upload = multer({ storage });

// Multer Config for QR Codes
const qrStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../public/uploads/qrcodes');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const machineId = req.body.machine_id || req.params.machine_id || 'unknown';
        cb(null, `qr_${machineId}_${file.fieldname}_${Date.now()}${ext}`);
    }
});
const qrUpload = multer({ qrStorage });

const csrfProtection = csrf();

// Custom middleware to expose CSRF and User to EJS
const setupLocals = (req, res, next) => {
    res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null;
    res.locals.user = req.session.user || null;
    next();
};

// 1. Diagnostics (No Auth, No CSRF)
router.get('/ping', (req, res) => res.send('pong'));

// 2. Auth routes (Apply CSRF)
router.get('/login', csrfProtection, setupLocals, (req, res, next) => {
    if (req.session.user) return res.redirect('/');
    next();
}, authController.loginPage);

router.post('/login', csrfProtection, setupLocals, authController.login);

router.get('/logout', authController.logout);

// 3. Authenticated Routes Protection
router.use(isAuthenticated);

// 4. MULTIPART ROUTES (Multer FIRST, then CSRF)
// These need special handling because Multer must parse the body before CSRF can check the token if it's in the body.
router.post('/machines/create', qrUpload.fields([{ name: 'test_qr', maxCount: 1 }, { name: 'actual_qr', maxCount: 1 }]), csrfProtection, setupLocals, machineController.create);
router.post('/machines/update/:id', qrUpload.fields([{ name: 'test_qr', maxCount: 1 }, { name: 'actual_qr', maxCount: 1 }]), csrfProtection, setupLocals, machineController.edit);

// 5. Global CSRF for all other dashboard routes
router.use(csrfProtection);
router.use(setupLocals);

router.get('/', dashboardController.getDashboard);
router.get('/dashboard/revenue-chart', dashboardController.getRevenueChartData);
router.get('/machines', machineController.list);
router.get('/machines/export', machineController.exportCSV);
router.get('/machines/export-xlsx', machineController.exportXLSX);
router.get('/machines/export-pdf', machineController.exportPDF);
router.post('/machines/delete/:id', machineController.delete); // Using POST for delete
router.get('/machines/delete/:id', machineController.delete);
router.get('/transactions', transactionController.list);
router.get('/transactions/export', transactionController.exportCSV);
router.get('/transactions/export-xlsx', transactionController.exportXLSX);
router.get('/transactions/export-pdf', transactionController.exportPDF);
router.get('/users', userController.list);
router.get('/users/export', userController.exportCSV);
router.get('/users/export-xlsx', userController.exportXLSX);
router.get('/users/export-pdf', userController.exportPDF);
router.get('/users/dashboard/:id', userController.ownerDashboard);
router.get('/users/dashboard/:id/revenue-chart', userController.getOwnerRevenueChartData);
router.post('/users/toggle-status/:id', userController.toggleStatus);
router.post('/users/create', userController.create);
router.post('/users/update/:id', userController.update);
router.post('/users/delete/:id', userController.delete);
const machineControlController = require('../controllers/machineControlController');

router.get('/analytics', analyticsController.getStats);
router.get('/logs', machineControlController.getLogs);
router.get('/logs/export', machineControlController.exportLogs);
router.get('/logs/export-xlsx', machineControlController.exportLogsXLSX);
router.get('/logs/export-pdf', machineControlController.exportLogsPDF);

// Profile Routes (for both admin and users)
router.get('/admin/profile', profileController.showProfile);
router.post('/admin/profile/update', profileController.updateProfile);
router.post('/admin/profile/password', profileController.changePassword);
router.get('/users/profile', profileController.showProfile);
router.post('/users/profile/update', profileController.updateProfile);
router.post('/users/profile/password', profileController.changePassword);

// Machine Control & Remote GPIO
router.get('/machines/control/:machine_id', machineControlController.controlCenter);
router.post('/machines/control/:machine_id/toggle', machineControlController.toggleGPIO);
router.post('/machines/control/:machine_id/pulse', machineControlController.pulseGPIO);
router.post('/machines/control/:machine_id/sequence', machineControlController.runSequence);
router.post('/machines/control/:machine_id/sequence/update', machineControlController.updateSequenceConfig);
router.post('/machines/control/:machine_id/config', machineControlController.updateGPIOConfig);
router.post('/machines/control/:machine_id/emergency-stop', machineControlController.emergencyStop);
router.post('/machines/control/:machine_id/reconnect-wifi', machineControlController.reconnectWifi);
router.post('/machines/control/:machine_id/ota', upload.single('firmware'), machineControlController.otaUpdate);
router.post('/machines/control/:machine_id/update-primary', machineControlController.updatePrimarySequence);

module.exports = router;
