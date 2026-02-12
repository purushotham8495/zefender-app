const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Machine = require('./machine');

const Transaction = sequelize.define('Transaction', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    machine_id: {
        type: DataTypes.STRING,
        allowNull: true, // Sometimes payment might not have machine ID
        references: {
            model: Machine,
            key: 'machine_id'
        }
    },
    razorpay_payment_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    razorpay_order_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    currency: {
        type: DataTypes.STRING,
        defaultValue: 'INR'
    },
    payment_status: {
        type: DataTypes.STRING,
        allowNull: false
    },
    payment_method: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customer_email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customer_phone: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customer_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    },
    machine_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    owner_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    vpa: {
        type: DataTypes.STRING, // UPI ID
        allowNull: true
    },
    event_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    raw_payload: {
        type: DataTypes.JSON,
        allowNull: true
    },
    trigger_status: {
        type: DataTypes.ENUM('pending', 'processed', 'failed'),
        defaultValue: 'pending'
    },
    trigger_source: {
        type: DataTypes.ENUM('webhook', 'manual'),
        defaultValue: 'webhook'
    },
    triggered_by: {
        type: DataTypes.STRING, // Username or ID of the person who triggered it
        allowNull: true
    },
    processed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'transactions',
    timestamps: true,
    underscored: true
});

// Define Association
Machine.hasMany(Transaction, { foreignKey: 'machine_id', sourceKey: 'machine_id' });
Transaction.belongsTo(Machine, { foreignKey: 'machine_id', targetKey: 'machine_id' });

module.exports = Transaction;
