/**
 * MP3 Module Migration Script
 * Run once: node scripts/migrate_mp3.js
 * 
 * Safely adds:
 * - machines.has_mp3_module (BOOLEAN, default false)
 * - machine_sequences.track_number (INT, nullable)
 * - Extends machine_sequences.action ENUM to include PLAY_TRACK
 */

const dotenv = require('dotenv');
dotenv.config();

const sequelize = require('../src/config/database');

async function migrate() {
    console.log('🔧 Starting MP3 Module Migration...');

    try {
        await sequelize.authenticate();
        console.log('✅ DB Connected');

        const qi = sequelize.getQueryInterface();
        const tableDesc = await qi.describeTable('machines');

        // 1. Add has_mp3_module to machines
        if (!tableDesc.has_mp3_module) {
            await qi.addColumn('machines', 'has_mp3_module', {
                type: require('sequelize').DataTypes.BOOLEAN,
                defaultValue: false,
                allowNull: false
            });
            console.log('✅ Added machines.has_mp3_module');
        } else {
            console.log('⏭  machines.has_mp3_module already exists');
        }

        // 2. Add track_number to machine_sequences
        const seqDesc = await qi.describeTable('machine_sequences');
        if (!seqDesc.track_number) {
            await qi.addColumn('machine_sequences', 'track_number', {
                type: require('sequelize').DataTypes.INTEGER,
                allowNull: true,
                defaultValue: null
            });
            console.log('✅ Added machine_sequences.track_number');
        } else {
            console.log('⏭  machine_sequences.track_number already exists');
        }

        // 3. Extend action ENUM — MySQL requires direct ALTER TABLE
        await sequelize.query(
            "ALTER TABLE machine_sequences MODIFY COLUMN action ENUM('ON','OFF','ALL_ON','ALL_OFF','PLAY_TRACK') NOT NULL"
        );
        console.log('✅ Extended machine_sequences.action ENUM with PLAY_TRACK');

        console.log('\n🎉 Migration complete! Restart your server.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
