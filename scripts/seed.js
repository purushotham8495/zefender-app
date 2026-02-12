const dotenv = require('dotenv');
dotenv.config();
const sequelize = require('../src/config/database');
const Machine = require('../src/models/machine');
const Transaction = require('../src/models/transaction');
const User = require('../src/models/user');

const seed = async () => {
    try {
        await sequelize.sync({ force: true }); // Reset DB

        // Create Admin
        await User.create({
            username: 'admin',
            password: 'Admin@123', // Will be hashed by hook
            role: 'admin'
        });
        console.log('Admin user created');

        // Create Machines
        const machines = await Machine.bulkCreate([
            { machine_id: 'M001', machine_name: 'Metro Station 1', location: 'Delhi', status: 'active' },
            { machine_id: 'M002', machine_name: 'Mall of India', location: 'Noida', status: 'active' },
            { machine_id: 'M003', machine_name: 'Cyber Hub', location: 'Gurgaon', status: 'inactive' }
        ]);
        console.log('Machines created');

        // Create Dummy Transactions
        const transactions = [];
        for (let i = 0; i < 50; i++) {
            const machine = machines[Math.floor(Math.random() * machines.length)];
            const amount = [50, 100, 150][Math.floor(Math.random() * 3)];
            const status = Math.random() > 0.1 ? 'captured' : 'failed';
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 10)); // Last 10 days

            transactions.push({
                machine_id: machine.machine_id,
                razorpay_payment_id: `pay_${Math.random().toString(36).substring(7)}`,
                razorpay_order_id: `order_${Math.random().toString(36).substring(7)}`,
                amount: amount,
                currency: 'INR',
                payment_status: status,
                payment_method: ['card', 'upi', 'wallet'][Math.floor(Math.random() * 3)],
                event_time: date,
                raw_payload: {}
            });
        }
        await Transaction.bulkCreate(transactions);
        console.log('Transactions created');

        process.exit();
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
};

seed();
