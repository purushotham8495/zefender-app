const Transaction = require('../models/transaction');
const Machine = require('../models/machine');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

exports.list = async (req, res) => {
    try {
        const { page = 1, limit = 50, machine_id, status, date_from, date_to, location, sort = 'event_time', order = 'DESC' } = req.query;
        const offset = (page - 1) * limit;

        // ... existing valid filter logic ...

        // Sorting Logic
        let orderClause = [['event_time', 'DESC']]; // Default
        const validSortFields = ['event_time', 'amount', 'machine_id', 'payment_status', 'payment_method'];

        if (validSortFields.includes(sort)) {
            orderClause = [[sort, order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']];
        }

        const user = req.session.user;

        const where = {};

        if (user.role === 'owner') {
            const userMachines = await Machine.findAll({
                where: { owner_id: user.id },
                attributes: ['machine_id']
            });
            const machineIds = userMachines.map(m => m.machine_id);

            // If filtering by specific machine, ensure owner owns it
            if (machine_id) {
                if (!machineIds.includes(machine_id)) {
                    // Trying to access machine not owned by user
                    return res.render('transactions/index', { transactions: [], totalPages: 0, currentPage: 1, query: req.query });
                }
                where.machine_id = machine_id;
            } else {
                where.machine_id = { [Op.in]: machineIds };
            }
        } else {
            if (machine_id) where.machine_id = machine_id;
        }

        if (status) where.payment_status = status;
        if (date_from && date_to) {
            where.event_time = { [Op.between]: [new Date(date_from), new Date(date_to)] };
        }

        const includeOptions = [{ model: Machine }];

        if (location) {
            includeOptions[0].where = {
                location: { [Op.like]: `%${location}%` }
            };
        }

        const { count, rows } = await Transaction.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: orderClause,
            include: includeOptions
        });

        if (rows.length > 0) {
            console.log('Sample Transaction Row:', JSON.stringify(rows[0], null, 2));
        }

        // Calculate Period Stats (Daily, Weekly, Monthly)
        // These are independent of the current filters (except maybe owner filter for security)

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        weekStart.setHours(0, 0, 0, 0);

        const monthStart = new Date();
        monthStart.setDate(monthStart.getDate() - 30);
        monthStart.setHours(0, 0, 0, 0);

        // Security filter: User can only see their own stats
        const baseStatsWhere = {};
        if (user.role === 'owner') {
            // We need to fetch machine IDs again if not available in scope, 
            // but we did it earlier. Reuse `where.machine_id` logic if possible.
            // But distinct `where` was built for the main query.
            // Let's re-use the `where` logic but REMOVE date/status/location filters to get "Global" stats for this user.
            // Actually, `where` already contains `machine_id` restriction for owners.
            if (where.machine_id) {
                baseStatsWhere.machine_id = where.machine_id;
            }
        }
        // Ensure we only count captured payments for revenue
        baseStatsWhere.payment_status = 'captured';

        const getPeriodStats = async (fromDate) => {
            return await Transaction.findOne({
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('amount')), 'revenue'],
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count']
                ],
                where: {
                    ...baseStatsWhere,
                    event_time: { [Op.gte]: fromDate }
                }
            });
        };

        const [dailyStats, weeklyStats, monthlyStats, overallStats] = await Promise.all([
            getPeriodStats(todayStart),
            getPeriodStats(weekStart),
            getPeriodStats(monthStart),
            getPeriodStats(new Date(0)) // All time
        ]);

        const formatStat = (result) => ({
            revenue: parseFloat(result?.getDataValue('revenue') || 0),
            count: parseInt(result?.getDataValue('count') || 0)
        });

        const periodStats = {
            daily: formatStat(dailyStats),
            weekly: formatStat(weeklyStats),
            monthly: formatStat(monthlyStats),
            allTime: formatStat(overallStats)
        };

        res.render('transactions/index', {
            transactions: rows,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            query: req.query,
            periodStats
        });
    } catch (error) {
        console.error(error);
        res.render('error', { message: 'Error retrieving transactions: ' + error.message });
    }
};
