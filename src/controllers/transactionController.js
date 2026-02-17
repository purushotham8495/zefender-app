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

exports.exportCSV = async (req, res) => {
    try {
        const { machine_id, status, date_from, date_to, location } = req.query;
        const user = req.session.user;
        const where = {};

        if (user.role === 'owner') {
            const userMachines = await Machine.findAll({
                where: { owner_id: user.id },
                attributes: ['machine_id']
            });
            const machineIds = userMachines.map(m => m.machine_id);
            if (machine_id) {
                if (!machineIds.includes(machine_id)) return res.status(403).send('Unauthorized');
                where.machine_id = machine_id;
            } else {
                where.machine_id = { [Op.in]: machineIds };
            }
        } else if (machine_id) {
            where.machine_id = machine_id;
        }

        if (status) where.payment_status = status;
        if (date_from && date_to) {
            where.event_time = { [Op.between]: [new Date(date_from), new Date(date_to)] };
        }

        const includeOptions = [{ model: Machine }];
        if (location) {
            includeOptions[0].where = { location: { [Op.like]: `%${location}%` } };
        }

        const transactions = await Transaction.findAll({
            where,
            include: includeOptions,
            order: [['event_time', 'DESC']],
            raw: true,
            nest: true
        });

        const { Parser } = require('json2csv');
        const fields = [
            { label: 'Date/Time', value: 'event_time' },
            { label: 'Machine ID', value: 'machine_id' },
            { label: 'Machine Name', value: 'Machine.machine_name' },
            { label: 'Amount (INR)', value: 'amount' },
            { label: 'Status', value: 'payment_status' },
            { label: 'Method', value: 'payment_method' },
            { label: 'Razorpay Payment ID', value: 'razorpay_payment_id' },
            { label: 'Razorpay Order ID', value: 'razorpay_order_id' },
            { label: 'Customer Name', value: 'customer_name' },
            { label: 'Customer Email', value: 'customer_email' },
            { label: 'Customer Phone', value: 'customer_phone' }
        ];

        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(transactions);

        res.header('Content-Type', 'text/csv');
        res.attachment(`transactions_${Date.now()}.csv`);
        return res.send(csv);

    } catch (error) {
        console.error(error);
        res.status(500).send('Error exporting transactions: ' + error.message);
    }
};

exports.exportXLSX = async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const { machine_id, status, date_from, date_to, location } = req.query;
        const user = req.session.user;
        const where = {};

        if (user.role === 'owner') {
            const userMachines = await Machine.findAll({
                where: { owner_id: user.id },
                attributes: ['machine_id']
            });
            const machineIds = userMachines.map(m => m.machine_id);
            if (machine_id) {
                if (!machineIds.includes(machine_id)) return res.status(403).send('Unauthorized');
                where.machine_id = machine_id;
            } else {
                where.machine_id = { [Op.in]: machineIds };
            }
        } else if (machine_id) {
            where.machine_id = machine_id;
        }

        if (status) where.payment_status = status;
        if (date_from && date_to) {
            where.event_time = { [Op.between]: [new Date(date_from), new Date(date_to)] };
        }

        const includeOptions = [{ model: Machine }];
        if (location) {
            includeOptions[0].where = { location: { [Op.like]: `%${location}%` } };
        }

        const transactions = await Transaction.findAll({
            where,
            include: includeOptions,
            order: [['event_time', 'DESC']]
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Transactions');

        worksheet.columns = [
            { header: 'Date/Time', key: 'event_time', width: 25 },
            { header: 'Machine ID', key: 'machine_id', width: 20 },
            { header: 'Machine Name', key: 'machine_name', width: 20 },
            { header: 'Amount (INR)', key: 'amount', width: 15 },
            { header: 'Status', key: 'payment_status', width: 15 },
            { header: 'Method', key: 'payment_method', width: 15 },
            { header: 'Payment ID', key: 'razorpay_payment_id', width: 25 },
            { header: 'Customer', key: 'customer', width: 30 }
        ];

        transactions.forEach(tx => {
            worksheet.addRow({
                event_time: tx.event_time,
                machine_id: tx.machine_id,
                machine_name: tx.Machine ? tx.Machine.machine_name : 'N/A',
                amount: tx.amount,
                payment_status: tx.payment_status,
                payment_method: tx.payment_method,
                razorpay_payment_id: tx.razorpay_payment_id,
                customer: `${tx.customer_name || 'N/A'} (${tx.customer_phone || 'N/A'})`
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=transactions_${Date.now()}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error(error);
        res.status(500).send('Error exporting XLSX: ' + error.message);
    }
};

exports.exportPDF = async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const { machine_id, status, date_from, date_to, location } = req.query;
        const user = req.session.user;
        const where = {};

        if (user.role === 'owner') {
            const userMachines = await Machine.findAll({
                where: { owner_id: user.id },
                attributes: ['machine_id']
            });
            const machineIds = userMachines.map(m => m.machine_id);
            if (machine_id) {
                if (!machineIds.includes(machine_id)) return res.status(403).send('Unauthorized');
                where.machine_id = machine_id;
            } else {
                where.machine_id = { [Op.in]: machineIds };
            }
        } else if (machine_id) {
            where.machine_id = machine_id;
        }

        if (status) where.payment_status = status;
        if (date_from && date_to) {
            where.event_time = { [Op.between]: [new Date(date_from), new Date(date_to)] };
        }

        const includeOptions = [{ model: Machine }];
        if (location) {
            includeOptions[0].where = { location: { [Op.like]: `%${location}%` } };
        }

        const transactions = await Transaction.findAll({
            where,
            include: includeOptions,
            order: [['event_time', 'DESC']]
        });

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=transactions_${Date.now()}.pdf`);

        doc.pipe(res);

        doc.fontSize(20).text('Zefender Transaction Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        const startX = 30;
        let currentY = doc.y;

        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', startX, currentY);
        doc.text('Machine', startX + 130, currentY);
        doc.text('Amount', startX + 250, currentY);
        doc.text('Status', startX + 320, currentY);
        doc.text('Customer', startX + 400, currentY);

        doc.moveDown();
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(startX, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica').fontSize(8);
        transactions.forEach(tx => {
            if (doc.y > 750) doc.addPage();
            currentY = doc.y;
            doc.text(new Date(tx.event_time).toLocaleString(), startX, currentY);
            doc.text(tx.Machine ? tx.Machine.machine_name.substring(0, 20) : 'N/A', startX + 130, currentY);
            doc.text(`INR ${tx.amount}`, startX + 250, currentY);
            doc.text(tx.payment_status, startX + 320, currentY);
            doc.text((tx.customer_name || 'N/A').substring(0, 20), startX + 400, currentY);
            doc.moveDown();
        });

        doc.end();

    } catch (error) {
        console.error(error);
        res.status(500).send('Error exporting PDF: ' + error.message);
    }
};
