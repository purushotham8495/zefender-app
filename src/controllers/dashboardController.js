const Transaction = require('../models/transaction');
const Machine = require('../models/machine');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { getRangeStartDate, getRangeLabel } = require('../utils/rangeHelper');

exports.getDashboard = async (req, res) => {
    try {
        const user = req.session.user;
        const isOwner = user.role === 'owner';
        // Global range (optional usage, can default to 'all' or 'today' for KPIs if desired, or keep as is)
        const range = req.query.range || 'all'; // Default changed to 'all' (All Time) as per user request to show lifetime data by default.
        // Actually, user said context only for revenue trend. So KPIs should probably be fixed or default?
        // Let's keep existing logic but default to 'today' if not specified.
        const startDate = getRangeStartDate(range);

        let machineFilter = {};
        if (isOwner) {
            machineFilter = { owner_id: user.id };
        }

        // Get user's machine IDs for transaction filtering
        let transactionFilter = { payment_status: 'captured' };

        if (isOwner) {
            const userMachines = await Machine.findAll({
                where: machineFilter,
                attributes: ['machine_id']
            });
            const machineIds = userMachines.map(m => m.machine_id);
            transactionFilter.machine_id = machineIds;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        // KPIs (Global or Range based on existing param? existing param affects all currently)
        const revenueAgg = await Transaction.sum('amount', {
            where: { ...transactionFilter, event_time: { [Op.gte]: startDate } }
        });
        const totalRevenue = revenueAgg || 0;

        const totalTransactionsRange = await Transaction.count({
            where: {
                ...(isOwner ? { machine_id: transactionFilter.machine_id } : {}),
                payment_status: 'captured',
                event_time: { [Op.gte]: startDate }
            }
        });

        // Prepare SQL Fragments for dynamic filtering (Owner vs Admin)
        let baseWhere = "payment_status = 'captured'";
        let replacements = {};

        if (isOwner) {
            // Already fetched machineIds above
            if (transactionFilter.machine_id && transactionFilter.machine_id.length > 0) {
                baseWhere += " AND machine_id IN (:machineIds)";
                replacements.machineIds = transactionFilter.machine_id;
            } else {
                // Owner has no machines, so no transactions should match
                baseWhere += " AND 1=0";
            }
        }

        // Today's Sales
        const [todayResult] = await sequelize.query(
            `SELECT SUM(amount) as total FROM transactions WHERE ${baseWhere} AND event_time >= :today`,
            { replacements: { ...replacements, today }, type: sequelize.QueryTypes.SELECT }
        );
        const todaySales = todayResult ? (parseFloat(todayResult.total) || 0) : 0;

        // Monthly Sales
        const [monthResult] = await sequelize.query(
            `SELECT SUM(amount) as total FROM transactions WHERE ${baseWhere} AND event_time >= :startOfMonth`,
            { replacements: { ...replacements, startOfMonth }, type: sequelize.QueryTypes.SELECT }
        );
        const monthlySales = monthResult ? (parseFloat(monthResult.total) || 0) : 0;

        const activeMachines = await Machine.count({
            where: {
                status: 'active',
                ...machineFilter
            }
        });

        // --- Charts Data (Initial Load using Range) ---
        // Dynamic Range based on user selection
        const revenueByDayRaw = await sequelize.query(
            `SELECT DATE(event_time) as date, SUM(amount) as total_revenue 
             FROM transactions 
             WHERE ${baseWhere} AND event_time >= :startDate
             GROUP BY DATE(event_time) 
             ORDER BY date ASC`,
            { replacements: { ...replacements, startDate }, type: sequelize.QueryTypes.SELECT }
        );

        const revenueByDay = revenueByDayRaw.map(r => ({
            date: r.date,
            total_revenue: parseFloat(r.total_revenue)
        }));

        // Payment Method Split
        const methodSplitRaw = await sequelize.query(
            `SELECT payment_method, COUNT(id) as count 
             FROM transactions 
             WHERE ${baseWhere} 
             GROUP BY payment_method`,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        const methodSplit = methodSplitRaw.map(m => ({
            payment_method: m.payment_method || 'Unknown',
            count: parseInt(m.count)
        }));

        // Machine Wise Sales
        const machineSalesRaw = await sequelize.query(
            `SELECT machine_id, SUM(amount) as total_sales 
             FROM transactions 
             WHERE ${baseWhere} 
             GROUP BY machine_id 
             ORDER BY total_sales DESC 
             LIMIT 5`,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        const machineSales = machineSalesRaw.map(m => ({
            machine_id: m.machine_id,
            total_sales: parseFloat(m.total_sales)
        }));

        const chartsData = {
            revenueByDay,
            methodSplit,
            machineSales
        };

        // Peak Trading Hours
        const peakHoursRaw = await sequelize.query(
            `SELECT HOUR(event_time) as hour, COUNT(*) as count 
             FROM transactions 
             WHERE ${baseWhere} 
             GROUP BY HOUR(event_time) 
             ORDER BY hour ASC`,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );
        // Fill missing hours (0-23)
        const peakHoursMap = new Map(peakHoursRaw.map(p => [p.hour, parseInt(p.count)]));
        const peakHours = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            count: peakHoursMap.get(i) || 0
        }));

        // Recent Activity
        const recentActivityRaw = await sequelize.query(
            `SELECT * FROM transactions 
             WHERE ${baseWhere} 
             ORDER BY event_time DESC 
             LIMIT 5`,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        // Owner Comparison (Admin Only)
        let ownerComparison = [];
        if (!isOwner) {
            const ownerCompRaw = await sequelize.query(
                `SELECT owner_name, SUM(amount) as total_revenue, COUNT(*) as txn_count 
                 FROM transactions 
                 WHERE ${baseWhere} AND owner_name IS NOT NULL
                 GROUP BY owner_name 
                 ORDER BY total_revenue DESC 
                 LIMIT 10`,
                { replacements, type: sequelize.QueryTypes.SELECT }
            );
            ownerComparison = ownerCompRaw.map(o => ({
                owner_name: o.owner_name,
                total_revenue: parseFloat(o.total_revenue),
                txn_count: parseInt(o.txn_count)
            }));
        }

        // Calculate AOV
        const aov = totalTransactionsRange > 0 ? (totalRevenue / totalTransactionsRange).toFixed(0) : 0;

        const chartsJSON = {
            revenue: JSON.stringify(revenueByDay || []),
            methods: JSON.stringify(methodSplit || []),
            machines: JSON.stringify(machineSales || []),
            peakHours: JSON.stringify(peakHours || []),
            ownerComparison: JSON.stringify(ownerComparison || [])
        };

        // Machine Status List (Cluster View)
        const machineStatuses = await Machine.findAll({
            where: machineFilter,
            attributes: ['machine_id', 'machine_name', 'is_connected', 'last_heartbeat'],
            order: [['is_connected', 'DESC'], ['machine_id', 'ASC']],
            raw: true
        });

        res.render('dashboard', {
            kpis: {
                totalRevenue,
                totalTransactions: totalTransactionsRange,
                todaySales,
                monthlySales,
                activeMachines,
                aov
            },
            charts: chartsData,
            recentActivity: recentActivityRaw,
            machineStatuses, // Added this
            chartsJSON,
            currentRange: range,
            rangeLabel: getRangeLabel(range)
        });

    } catch (error) {
        console.error('Dashboard Error:', error);
        res.status(500).send('Server Error');
    }
};

// New Endpoint for Revenue Chart Specific Data
exports.getRevenueChartData = async (req, res) => {
    try {
        const user = req.session.user;
        const isOwner = user.role === 'owner';
        const range = req.query.range || 'all';
        const startDate = getRangeStartDate(range);

        let machineFilter = {}; // For ownership check only
        let transactionFilter = { payment_status: 'captured' };

        if (isOwner) {
            machineFilter = { owner_id: user.id };
            const userMachines = await Machine.findAll({
                where: machineFilter,
                attributes: ['machine_id']
            });
            const machineIds = userMachines.map(m => m.machine_id);
            transactionFilter.machine_id = machineIds;
        }

        // Prepare Base Where
        let baseWhere = "payment_status = 'captured'";
        let replacements = { startDate };

        if (isOwner) {
            if (transactionFilter.machine_id && transactionFilter.machine_id.length > 0) {
                baseWhere += " AND machine_id IN (:machineIds)";
                replacements.machineIds = transactionFilter.machine_id;
            } else {
                return res.json({ revenue: [] });
            }
        }

        const revenueByDayRaw = await sequelize.query(
            `SELECT DATE(event_time) as date, SUM(amount) as total_revenue 
             FROM transactions 
             WHERE ${baseWhere} AND event_time >= :startDate
             GROUP BY DATE(event_time) 
             ORDER BY date ASC`,
            { replacements: { ...replacements }, type: sequelize.QueryTypes.SELECT }
        );

        const revenue = revenueByDayRaw.map(r => ({
            date: r.date,
            total_revenue: parseFloat(r.total_revenue)
        }));

        res.json({ revenue });
    } catch (error) {
        console.error('Revenue Chart Data Error:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};
