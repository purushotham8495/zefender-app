const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  dialect: process.env.DB_DIALECT || 'mysql',
  logging: false, // Set to console.log to see SQL queries
  storage: process.env.DB_DIALECT === 'sqlite' ? './database.sqlite' : undefined,
  pool: {
    max: 2,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

module.exports = sequelize;
