const Transaction = require('../models/transaction');
const Machine = require('../models/machine');
const User = require('../models/user');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { getRangeStartDate, getRangeLabel } = require('../utils/rangeHelper');

exports.getStats = async (req, res) => {
    try {
        const user = req.session.user;
        const isOwner = user.role === 'owner';
        const range = req.query.range || '30d'; // Default to 30 days
        const startDate = getRangeStartDate(range);

        let transactionWhere = {
            payment_status: 'captured',
            event_time: { [Op.gte]: startDate }
        };

        // 1. Determine Machine IDs filter if Owner
        let allowedMachineIds = null;
        if (isOwner) {
            const userMachines = await Machine.findAll({
                where: { owner_id: user.id },
                attributes: ['machine_id']
            });
            allowedMachineIds = userMachines.map(m => m.machine_id);
            transactionWhere.machine_id = allowedMachineIds;
        }

        // 2. Overall Stats
        const overallStats = await Transaction.findOne({
            attributes: [
                [sequelize.fn('SUM', sequelize.col('amount')), 'total_revenue'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'total_transactions']
            ],
            where: transactionWhere
        });

        let totalRev = 0;
        let totalTx = 0;
        if (overallStats) {
            totalRev = parseFloat(overallStats.getDataValue('total_revenue')) || 0;
            totalTx = parseInt(overallStats.getDataValue('total_transactions')) || 0;
        }

        // 3. Machine Aggregates (from Transactions)
        // Group by machine_id to get revenue per machine
        const txAggregates = await Transaction.findAll({
            attributes: [
                'machine_id',
                'machine_name', // fallback name
                'owner_name',   // fallback owner
                [sequelize.fn('SUM', sequelize.col('amount')), 'total_revenue'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'total_transactions']
            ],
            where: transactionWhere,
            group: ['machine_id', 'machine_name', 'owner_name']
        });

        // 4. Fetch Machine Details (for cleaning cost and current owner)
        // We get ALL machines that appear in transactions OR all owned machines (if owner)

        // Fix: machine_id might be null in transactions, so filter those out. 
        // Also if txAggregates is empty, we shouldn't query Machines with empty array in IN clause if that causes issue (though Sequelize usually handles it)

        let machineIdsInTx = txAggregates.map(t => t.machine_id).filter(id => id); // Remove nulls/undefined

        let machinesDetails = [];
        if (machineIdsInTx.length > 0) {
            machinesDetails = await Machine.findAll({
                where: {
                    machine_id: machineIdsInTx
                },
                include: [{
                    model: User,
                    as: 'owner',
                    attributes: ['username']
                }]
            });
        }


        const machineMap = {};
        machinesDetails.forEach(m => {
            machineMap[m.machine_id] = m;
        });

        // Merge Date
        let machineStats = txAggregates.map(tx => {
            const mId = tx.machine_id;
            const mDetail = machineMap[mId];

            return {
                machine_id: mId,
                machine_name: mDetail ? mDetail.machine_name : (tx.machine_name || 'Unknown'),
                owner_name: mDetail && mDetail.owner ? mDetail.owner.username : (tx.owner_name || 'Unknown'),
                dataValues: {
                    total_revenue: parseFloat(tx.getDataValue('total_revenue') || 0),
                    total_transactions: parseInt(tx.getDataValue('total_transactions') || 0)
                },
                cleaning_cost: mDetail ? mDetail.cleaning_cost : 0,
                Machine: mDetail // preserve for potential structure compatibility if view uses it
            };
        });

        // Sort by revenue
        machineStats.sort((a, b) => b.dataValues.total_revenue - a.dataValues.total_revenue);

        // 5. Customer (Owner) Aggregates
        // We can aggregate from the `machineStats` we just built to be consistent with displayed data
        const ownerMap = {};

        machineStats.forEach(stat => {
            const oName = stat.owner_name;
            if (!ownerMap[oName]) {
                ownerMap[oName] = {
                    owner_name: oName,
                    dataValues: {
                        total_revenue: 0,
                        total_transactions: 0,
                        active_kiosks: 0
                    }
                };
            }
            ownerMap[oName].dataValues.total_revenue += stat.dataValues.total_revenue;
            ownerMap[oName].dataValues.total_transactions += stat.dataValues.total_transactions;
            ownerMap[oName].dataValues.active_kiosks += 1;
        });

        const ownerStats = Object.values(ownerMap).sort((a, b) => b.dataValues.total_revenue - a.dataValues.total_revenue);

        // Calculate aggregates for the dashboard
        const stats = {
            totalRevenue: totalRev,
            totalTransactions: totalTx,
            platformRevenue: totalRev * 0.10,
            customerRevenue: totalRev * 0.90,
            avgTransaction: totalTx > 0 ? (totalRev / totalTx) : 0
        };

        res.render('analytics/index', {
            stats,
            machineStats,
            ownerStats,
            user,
            currentRange: range,
            rangeLabel: getRangeLabel(range)
        });
    } catch (error) {
        console.error('ANALYTICS ERROR:', error);
        res.status(500).send(`Error retrieving analytics: ${error.message}`);
    }
};
