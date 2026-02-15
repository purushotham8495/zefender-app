const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Machine = sequelize.define('Machine', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    machine_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    machine_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    location: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active'
    },
    owner_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users', // table name
            key: 'id'
        }
    },
    cleaning_cost: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00
    },
    is_connected: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    is_running_sequence: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    last_heartbeat: {
        type: DataTypes.DATE,
        allowNull: true
    },
    network_info: {
        type: DataTypes.JSON, // To store { ssid: "...", rssi: -60 }
        allowNull: true
    },
    primary_sequence_id: {
        type: DataTypes.STRING, // Can be 'DB_DEFAULT' or 'INTERNAL_CLEAN', etc.
        defaultValue: 'DB_DEFAULT'
    }
}, {
    tableName: 'machines',
    timestamps: true,
    underscored: true
});

const User = require('./user');

Machine.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
User.hasMany(Machine, { foreignKey: 'owner_id', as: 'machines' });

const MachineGPIO = require('./machineGPIO');
const MachineSequence = require('./machineSequence');

Machine.hasMany(MachineGPIO, { foreignKey: 'machine_id', sourceKey: 'machine_id', as: 'gpios' });
MachineGPIO.belongsTo(Machine, { foreignKey: 'machine_id', targetKey: 'machine_id' });

Machine.hasMany(MachineSequence, { foreignKey: 'machine_id', sourceKey: 'machine_id', as: 'sequences' });
MachineSequence.belongsTo(Machine, { foreignKey: 'machine_id', targetKey: 'machine_id' });

module.exports = Machine;
