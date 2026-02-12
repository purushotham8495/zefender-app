const crypto = require('crypto');
const Transaction = require('../models/transaction');
const Machine = require('../models/machine');
const MachineLog = require('../models/machineLog');
const MachineSequence = require('../models/machineSequence');
const socketManager = require('../utils/socketManager');

exports.handleRazorpayWebhook = async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // 1. Validate Signature
    const shasum = crypto.createHmac('sha256', secret);
    const payloadStr = req.rawBody ? req.rawBody : JSON.stringify(req.body);
    shasum.update(payloadStr);
    const digest = shasum.digest('hex');

    if (digest !== req.headers['x-razorpay-signature']) {
        console.error('Invalid signature');
        return res.status(400).json({ error: 'Invalid signature' });
    }

    const payload = req.body;
    const event = payload.event;

    console.log(`Received Webhook Event: ${event}`);

    if (event === 'payment.captured' || event === 'payment.failed') {
        const payment = payload.payload.payment.entity;

        const paymentId = payment.id;
        const orderId = payment.order_id;
        const amount = payment.amount / 100;
        const status = payment.status; // captured or failed
        const method = payment.method;
        const notes = payment.notes || {};
        const machineId = notes.machine_id || null;
        const customerName = notes.customer_name || notes.name || null;

        let vpa = null;
        if (payment.method === 'upi') {
            vpa = payment.vpa || (payment.acquirer_data ? payment.acquirer_data.vpa : null);
        }

        try {
            const existingTx = await Transaction.findOne({ where: { razorpay_payment_id: paymentId } });
            if (existingTx) {
                console.log(`Transaction ${paymentId} already exists. Skipping.`);
                return res.status(200).send('OK');
            }

            let machine = null;
            if (machineId) {
                machine = await Machine.findOne({
                    where: { machine_id: machineId },
                    include: ['owner']
                });
            }

            let ownerName = (machine && machine.owner) ? machine.owner.username : null;

            // Create Transaction with initial status
            const txn = await Transaction.create({
                machine_id: machineId,
                machine_name: machine ? machine.machine_name : null,
                owner_name: ownerName,
                razorpay_payment_id: paymentId,
                razorpay_order_id: orderId,
                amount: amount,
                currency: payment.currency,
                payment_status: status,
                payment_method: method,
                vpa: vpa,
                customer_email: payment.email,
                customer_phone: payment.contact,
                customer_name: customerName,
                description: payment.description,
                event_time: new Date(payload.created_at * 1000),
                raw_payload: payload,
                trigger_status: 'pending',
                trigger_source: 'webhook'
            });

            console.log(`Transaction ${paymentId} recorded. Status: ${status}`);

            // Vending Governance: Trigger Machine if payment captured
            if (status === 'captured' && machineId) {
                const sequences = await MachineSequence.findAll({
                    where: { machine_id: machineId },
                    order: [['step_index', 'ASC']]
                });

                if (sequences.length > 0) {
                    const success = socketManager.sendCommand(machineId, 'run_sequence', { steps: sequences });

                    if (success) {
                        // Update Transaction as Processed
                        await txn.update({
                            trigger_status: 'processed',
                            processed_at: new Date()
                        });

                        // Create Machine Log
                        await MachineLog.create({
                            machine_id: machineId,
                            triggered_by: 'Razorpay Webhook',
                            action_type: 'payment_trigger',
                            description: `Automatic trigger for payment ${paymentId} (₹${amount})`,
                            status: 'success',
                            transaction_id: paymentId
                        });

                        await Machine.update({ is_running_sequence: true }, { where: { machine_id: machineId } });

                        socketManager.broadcastUpdate(machineId, {
                            is_running_sequence: true,
                            new_transaction: {
                                amount: amount,
                                payment_status: status,
                                trigger_status: 'processed'
                            }
                        });
                        console.log(`Governance: Sequence successfully dispatched to ${machineId}`);
                    } else {
                        // Mark as Failed for Manual Retry
                        await txn.update({ trigger_status: 'failed' });

                        await MachineLog.create({
                            machine_id: machineId,
                            triggered_by: 'Razorpay Webhook',
                            action_type: 'payment_trigger',
                            description: `FAILED: Machine offline for payment ${paymentId}`,
                            status: 'failed',
                            transaction_id: paymentId
                        });

                        console.warn(`Governance: Machine ${machineId} offline. Transaction marked for manual retry.`);
                    }
                }
            }

            return res.status(200).send('OK');

        } catch (error) {
            console.error('Error in Webhook Governance:', error);
            return res.status(500).json({ error: 'Internal Governance Error' });
        }
    }

    res.status(200).send('OK');
};

