const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MachineSequence = sequelize.define('MachineSequence', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    machine_id: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
            model: 'machines',
            key: 'machine_id'
        }
    },
    step_index: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    pin_number: {
        type: DataTypes.INTEGER,
        allowNull: true // Allow null for global actions like ALL_ON/ALL_OFF
    },
    action: {
        type: DataTypes.ENUM('ON', 'OFF', 'ALL_ON', 'ALL_OFF'),
        allowNull: false
    },
    duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'machine_sequences',
    timestamps: true,
    underscored: true
});

module.exports = MachineSequence;
