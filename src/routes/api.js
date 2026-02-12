const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

router.post('/webhooks/razorpay', webhookController.handleRazorpayWebhook);

module.exports = router;
