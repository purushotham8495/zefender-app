const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MachineGPIO = sequelize.define('MachineGPIO', {
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
    pin_number: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    label: {
        type: DataTypes.STRING,
        allowNull: false
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    is_active_low: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'machine_gpios',
    timestamps: true,
    underscored: true
});

module.exports = MachineGPIO;
