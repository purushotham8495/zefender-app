const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Machine = require('./machine');

const MachineLog = sequelize.define('MachineLog', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    machine_id: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
            model: Machine,
            key: 'machine_id'
        }
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // Null for automated system actions
    },
    triggered_by: {
        type: DataTypes.STRING, // Username or service name
        allowNull: false
    },
    action_type: {
        type: DataTypes.ENUM('payment_trigger', 'manual_trigger', 'test_run', 'gpio_toggle', 'gpio_pulse', 'gpio_config_update', 'emergency_stop', 'ota_update', 'device_log'),
        allowNull: false
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('success', 'failed'),
        defaultValue: 'success'
    },
    transaction_id: {
        type: DataTypes.STRING, // External ID like razorpay_payment_id if applicable
        allowNull: true
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'machine_logs',
    timestamps: false,
    underscored: true
});

// Associations
Machine.hasMany(MachineLog, { foreignKey: 'machine_id', sourceKey: 'machine_id' });
MachineLog.belongsTo(Machine, { foreignKey: 'machine_id', targetKey: 'machine_id' });

module.exports = MachineLog;
