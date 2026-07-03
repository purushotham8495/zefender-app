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

const csrfProtection = csrf({ cookie: true });

router.use(csrfProtection);
router.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    res.locals.user = req.session.user || null;
    next();
});

// Diagnostic Route
router.get('/ping', (req, res) => res.send('pong'));

router.get('/login', authController.loginPage);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.get('/change-password', isAuthenticated, authController.changePasswordPage);
router.post('/change-password', isAuthenticated, authController.changePassword);

router.use(isAuthenticated);

router.get('/', dashboardController.getDashboard);
router.get('/dashboard/revenue-chart', dashboardController.getRevenueChartData);
router.get('/machines', machineController.list);
router.post('/machines/create', machineController.create);
router.post('/machines/update/:id', machineController.edit);
router.post('/machines/delete/:id', machineController.delete);
router.get('/transactions', transactionController.list);
router.get('/users', userController.list);
router.get('/users/dashboard/:id', userController.ownerDashboard);
router.get('/users/dashboard/:id/revenue-chart', userController.getOwnerRevenueChartData);
router.post('/users/toggle-status/:id', userController.toggleStatus);
router.post('/users/create', userController.create);
router.post('/users/update/:id', userController.update);
router.post('/users/delete/:id', userController.delete);
const machineControlController = require('../controllers/machineControlController');

router.get('/analytics', analyticsController.getStats);
router.get('/logs', machineControlController.getLogs);

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

module.exports = router;
