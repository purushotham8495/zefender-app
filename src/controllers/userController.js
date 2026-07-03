const User = require('../models/user');
const Machine = require('../models/machine');
const Transaction = require('../models/transaction');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const { getRangeStartDate, getRangeLabel } = require('../utils/rangeHelper');

exports.list = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin') {
            return res.redirect('/');
        }

        // Fetch owners
        const users = await User.findAll({
            where: { role: 'owner' },
            order: [['createdAt', 'DESC']]
        });

        // Get revenue stats per owner
        const stats = await sequelize.query(`
            SELECT 
                m.owner_id,
                COUNT(DISTINCT m.id) as machine_count,
                SUM(CASE WHEN DATE(t.event_time) = CURDATE() THEN t.amount ELSE 0 END) as today_revenue,
                SUM(t.amount) as total_revenue
            FROM machines m
            LEFT JOIN transactions t ON m.machine_id = t.machine_id AND t.payment_status = 'captured'
            GROUP BY m.owner_id
        `, { type: sequelize.QueryTypes.SELECT });

        const statsMap = {};
        stats.forEach(s => {
            if (s.owner_id) statsMap[s.owner_id] = s;
        });

        const ownersWithStats = users.map(u => {
            const uData = u.get({ plain: true });
            const s = statsMap[u.id] || { machine_count: 0, today_revenue: 0, total_revenue: 0 };
            uData.machine_count = s.machine_count || 0;
            uData.today_revenue = parseFloat(s.today_revenue) || 0;
            uData.total_revenue = parseFloat(s.total_revenue) || 0;
            return uData;
        });

        const error = req.session.error;
        delete req.session.error;
        res.render('users/index', { users: ownersWithStats, error });
    } catch (error) {
        console.error('CRITICAL ERROR User list:', error.message, error.stack);
        res.status(500).send('Error retrieving users: ' + error.message);
    }
};

exports.ownerDashboard = async (req, res) => {
    try {
        const ownerId = req.params.id;

        // Security check: Admin or the owner themselves
        if (req.session.user.role !== 'admin' && req.session.user.id !== parseInt(ownerId)) {
            return res.redirect('/');
        }

        const range = req.query.range || 'all';
        const startDate = getRangeStartDate(range);

        const owner = await User.findByPk(ownerId);

        if (!owner || owner.role !== 'owner') {
            return res.redirect('/users');
        }

        const machines = await Machine.findAll({
            where: { owner_id: ownerId },
            order: [['createdAt', 'DESC']]
        });

        // Get Revenue stats for each machine
        const [todayRevenue] = await sequelize.query(
            `SELECT machine_id, SUM(amount) as total FROM transactions 
             WHERE payment_status = 'captured' AND DATE(event_time) = CURDATE() 
             GROUP BY machine_id`,
            { type: sequelize.QueryTypes.SELECT }
        );

        const totalRevenue = await sequelize.query(
            `SELECT machine_id, SUM(amount) as total FROM transactions 
             WHERE payment_status = 'captured' 
             GROUP BY machine_id`,
            { type: sequelize.QueryTypes.SELECT }
        );

        const todayMap = new Map((Array.isArray(todayRevenue) ? todayRevenue : [todayRevenue]).filter(r => r).map(r => [r.machine_id, parseFloat(r.total) || 0]));
        const totalMap = new Map((Array.isArray(totalRevenue) ? totalRevenue : [totalRevenue]).filter(r => r).map(r => [r.machine_id, parseFloat(r.total) || 0]));

        const machinesWithStats = machines.map(m => {
            const mData = m.toJSON();
            mData.today_revenue = todayMap.get(m.machine_id) || 0;
            mData.total_revenue = totalMap.get(m.machine_id) || 0;
            return mData;
        });

        const machineIds = machines.map(m => m.machine_id);

        const totalOwnerRevenueRange = await Transaction.sum('amount', {
            where: {
                machine_id: machineIds,
                payment_status: 'captured'
                // Removed event_time filter to make it truly cumulative (All Time)
            }
        }) || 0;

        const totalOwnerTransactionsRange = await Transaction.count({
            where: {
                machine_id: machineIds,
                payment_status: 'captured'
                // Removed event_time filter
            }
        });

        const todayOwnerRevenue = machinesWithStats.reduce((sum, m) => sum + m.today_revenue, 0);
        const activeMachinesCount = machines.filter(m => m.status === 'active').length;

        // --- Charts Data (Owner Specific) ---
        // machineIds already defined above
        const baseWhere = machineIds.length > 0 ? "payment_status = 'captured' AND machine_id IN (:machineIds)" : "payment_status = 'captured' AND 1=0";
        const replacements = { machineIds };

        // Revenue Trend
        const revenueTrendRaw = await sequelize.query(
            `SELECT DATE(event_time) as date, SUM(amount) as total 
             FROM transactions 
             WHERE ${baseWhere} AND event_time >= :startDate
             GROUP BY DATE(event_time) 
             ORDER BY date ASC`,
            { replacements: { ...replacements, startDate }, type: sequelize.QueryTypes.SELECT }
        );

        // Peak Hours
        const peakHoursRaw = await sequelize.query(
            `SELECT HOUR(event_time) as hour, COUNT(*) as count 
             FROM transactions 
             WHERE ${baseWhere} 
             GROUP BY HOUR(event_time) 
             ORDER BY hour ASC`,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );
        const peakHoursMap = new Map(peakHoursRaw.map(p => [p.hour, parseInt(p.count)]));
        const peakHours = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            count: peakHoursMap.get(i) || 0
        }));

        // Machine Breakdown
        const machineBreakdown = machinesWithStats.map(m => ({
            name: m.name || m.machine_id,
            revenue: m.total_revenue
        })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

        const chartsData = {
            revenueTrend: revenueTrendRaw,
            peakHours: peakHours,
            machineBreakdown: machineBreakdown
        };

        console.log('--- Owner Dashboard Charts Data ---');
        console.log('Owner ID:', ownerId);
        console.log('Revenue Trend Count:', revenueTrendRaw.length);
        console.log('Peak Hours Count:', peakHours.length);
        console.log('Breakdown Count:', machineBreakdown.length);
        console.log('-----------------------------------');

        // Recent Activity
        const recentActivity = await sequelize.query(
            `SELECT * FROM transactions 
             WHERE payment_status = 'captured' AND machine_id IN (:machineIds)
             ORDER BY event_time DESC 
             LIMIT 5`,
            { replacements: { machineIds: machineIds.length ? machineIds : [''] }, type: sequelize.QueryTypes.SELECT }
        );

        res.render('users/dashboard', {
            owner,
            machines: machinesWithStats,
            kpis: {
                totalRevenue: totalOwnerRevenueRange,
                totalTransactions: totalOwnerTransactionsRange,
                todaySales: todayOwnerRevenue,
                activeMachines: activeMachinesCount
            },
            chartsData,
            recentActivity, // Passed to view
            currentRange: range,
            rangeLabel: getRangeLabel(range)
        });
    } catch (error) {
        console.error('Owner dashboard error:', error);
        res.status(500).send('Error loading owner dashboard');
    }
};

exports.toggleStatus = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin') {
            return res.redirect('/');
        }
        const userId = req.params.id;
        const user = await User.findByPk(userId);
        if (user) {
            user.status = user.status === 'active' ? 'blocked' : 'active';
            await user.save();
        }
        res.redirect('/users');
    } catch (error) {
        console.error('Toggle status error:', error);
        res.redirect('/users');
    }
};

exports.create = async (req, res) => {
    try {
        const { username, password, email, phone } = req.body;
        if (!username || !password) {
            req.session.error = 'Username and password are required';
            return res.redirect('/users');
        }

        await User.create({
            username,
            email,
            phone,
            password,
            role: 'owner',
        });
        res.redirect('/users');
    } catch (error) {
        console.error(error);
        req.session.error = 'Error creating user: ' + error.message;
        res.redirect('/users');
    }
};

const bcrypt = require('bcryptjs');

exports.update = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin') {
            return res.redirect('/');
        }
        const { username, email, phone, password } = req.body;
        const userId = req.params.id;

        const updateData = { username, email, phone };
        if (password && password.trim() !== '') {
            updateData.password = password;
        }

        const user = await User.findByPk(userId);
        if (user) {
            await user.update(updateData);
        }
        res.redirect('/users');
    } catch (error) {
        console.error(error);
        req.session.error = 'Error updating user: ' + error.message;
        res.redirect('/users');
    }
};

exports.delete = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin') {
            return res.redirect('/');
        }
        const userId = req.params.id;

        // Check for assigned machines
        const machineCount = await require('../models/machine').count({ where: { owner_id: userId } });
        if (machineCount > 0) {
            req.session.error = 'Cannot delete owner. They have ' + machineCount + ' assigned machines. Please reassign machines first.';
            return res.redirect('/users');
        }

        await User.destroy({ where: { id: userId } });
        res.redirect('/users');
    } catch (error) {
        console.error(error);
        req.session.error = 'Error deleting user: ' + error.message;
        res.redirect('/users');
    }
};

exports.getOwnerRevenueChartData = async (req, res) => {
    try {
        const ownerId = req.params.id;
        const range = req.query.range || 'all';
        const { getRangeStartDate } = require('../utils/rangeHelper');
        const startDate = getRangeStartDate(range);

        // Security check
        if (req.session.user.role !== 'admin' && req.session.user.id !== parseInt(ownerId)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const machines = await Machine.findAll({
            attributes: ['machine_id'],
            where: { owner_id: ownerId }
        });
        const machineIds = machines.map(m => m.machine_id);

        if (machineIds.length === 0) {
            return res.json({ revenue: [] });
        }

        const revenueTrendRaw = await sequelize.query(
            `SELECT DATE(event_time) as date, SUM(amount) as total_revenue 
             FROM transactions 
             WHERE payment_status = 'captured' 
             AND machine_id IN (:machineIds) 
             AND event_time >= :startDate 
             GROUP BY DATE(event_time) 
             ORDER BY date ASC`,
            {
                replacements: { machineIds, startDate },
                type: sequelize.QueryTypes.SELECT
            }
        );

        const chartsData = {
            revenue: revenueTrendRaw
        };
        res.json(chartsData);
    } catch (error) {
        console.error('Error fetching owner revenue chart:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
