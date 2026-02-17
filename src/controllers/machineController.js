const Machine = require('../models/machine');
const User = require('../models/user');
const sequelize = require('../config/database');

exports.list = async (req, res) => {
    try {
        const user = req.session.user;
        const isOwner = user.role === 'owner';
        const where = {};
        if (isOwner) {
            where.owner_id = user.id;
        }

        const machines = await Machine.findAll({
            where,
            order: [['createdAt', 'DESC']],
            include: ['owner']
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

        // Convert results to maps for easy lookup
        const todayMap = new Map((Array.isArray(todayRevenue) ? todayRevenue : [todayRevenue]).filter(r => r).map(r => [r.machine_id, parseFloat(r.total) || 0]));
        const totalMap = new Map((Array.isArray(totalRevenue) ? totalRevenue : [totalRevenue]).filter(r => r).map(r => [r.machine_id, parseFloat(r.total) || 0]));

        const machinesWithStats = machines.map(m => {
            const mData = m.toJSON();
            mData.today_revenue = todayMap.get(m.machine_id) || 0;
            mData.total_revenue = totalMap.get(m.machine_id) || 0;
            return mData;
        });

        const owners = await User.findAll({ where: { role: 'owner' } });
        res.render('machines/index', { machines: machinesWithStats, owners });
    } catch (error) {
        console.error('Machine list error:', error);
        res.status(500).send('Error retrieving machines');
    }
};

exports.create = async (req, res) => {
    try {
        const machineData = { ...req.body };
        if (req.files) {
            if (req.files['test_qr']) machineData.test_qr_url = `/uploads/qrcodes/${req.files['test_qr'][0].filename}`;
            if (req.files['actual_qr']) machineData.actual_qr_url = `/uploads/qrcodes/${req.files['actual_qr'][0].filename}`;
        }
        await Machine.create(machineData);
        res.redirect('/machines');
    } catch (error) {
        console.error(error);
        try {
            const machines = await Machine.findAll({
                order: [['createdAt', 'DESC']],
                include: ['owner']
            });
            const owners = await User.findAll({ where: { role: 'owner' } });
            res.render('machines/index', { machines, owners, error: 'Error creating machine: ' + error.message });
        } catch (e) {
            res.status(500).send('Internal Server Error');
        }
    }
};

exports.edit = async (req, res) => {
    try {
        const updateData = { ...req.body };
        // If owner_id is empty string, set it to null
        if (updateData.owner_id === '') updateData.owner_id = null;

        if (req.files) {
            if (req.files['test_qr']) updateData.test_qr_url = `/uploads/qrcodes/${req.files['test_qr'][0].filename}`;
            if (req.files['actual_qr']) updateData.actual_qr_url = `/uploads/qrcodes/${req.files['actual_qr'][0].filename}`;
        }

        await Machine.update(updateData, { where: { id: req.params.id } });
        res.redirect('/machines');
    } catch (error) {
        console.error(error);
        const machines = await Machine.findAll({ order: [['createdAt', 'DESC']], include: ['owner'] });
        const owners = await User.findAll({ where: { role: 'owner' } });
        res.render('machines/index', { machines, owners, error: 'Error updating machine: ' + error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        await Machine.destroy({ where: { id: req.params.id } });
        res.redirect('/machines');
    } catch (error) {
        console.error(error);
        const machines = await Machine.findAll({ order: [['createdAt', 'DESC']], include: ['owner'] });
        const owners = await User.findAll({ where: { role: 'owner' } });
        res.render('machines/index', { machines, owners, error: 'Error deleting machine: ' + error.message });
    }
};

exports.exportCSV = async (req, res) => {
    try {
        const user = req.session.user;
        const where = {};
        if (user.role === 'owner') where.owner_id = user.id;

        const machines = await Machine.findAll({
            where,
            include: ['owner'],
            order: [['createdAt', 'DESC']],
            raw: true,
            nest: true
        });

        const { Parser } = require('json2csv');
        const fields = [
            { label: 'Machine ID', value: 'machine_id' },
            { label: 'Name', value: 'machine_name' },
            { label: 'Location', value: 'location' },
            { label: 'Status', value: 'status' },
            { label: 'Owner', value: 'owner.username' },
            { label: 'Cleaning Cost', value: 'cleaning_cost' },
            { label: 'Connected', value: 'is_connected' },
            { label: 'Last Heartbeat', value: 'last_heartbeat' },
            { label: 'Primary Sequence', value: 'primary_sequence_id' }
        ];

        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(machines);

        res.header('Content-Type', 'text/csv');
        res.attachment(`machines_${Date.now()}.csv`);
        return res.send(csv);

    } catch (error) {
        console.error(error);
        res.status(500).send('Error exporting machines: ' + error.message);
    }
};

exports.exportXLSX = async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const user = req.session.user;
        const where = {};
        if (user.role === 'owner') where.owner_id = user.id;

        const machines = await Machine.findAll({
            where,
            include: ['owner'],
            order: [['createdAt', 'DESC']]
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Machines');

        worksheet.columns = [
            { header: 'Machine ID', key: 'machine_id', width: 20 },
            { header: 'Name', key: 'machine_name', width: 20 },
            { header: 'Location', key: 'location', width: 30 },
            { header: 'Status', key: 'status', width: 10 },
            { header: 'Owner', key: 'owner', width: 20 },
            { header: 'Cost', key: 'cleaning_cost', width: 10 },
            { header: 'Connected', key: 'is_connected', width: 10 },
            { header: 'Last Heartbeat', key: 'last_heartbeat', width: 25 },
            { header: 'Sequence', key: 'primary_sequence_id', width: 15 }
        ];

        machines.forEach(m => {
            worksheet.addRow({
                machine_id: m.machine_id,
                machine_name: m.machine_name,
                location: m.location,
                status: m.status,
                owner: m.owner ? m.owner.username : 'N/A',
                cleaning_cost: m.cleaning_cost,
                is_connected: m.is_connected ? 'Yes' : 'No',
                last_heartbeat: m.last_heartbeat || 'N/A',
                primary_sequence_id: m.primary_sequence_id
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=machines_${Date.now()}.xlsx`);

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
        const user = req.session.user;
        const where = {};
        if (user.role === 'owner') where.owner_id = user.id;

        const machines = await Machine.findAll({
            where,
            include: ['owner'],
            order: [['createdAt', 'DESC']]
        });

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=machines_${Date.now()}.pdf`);

        doc.pipe(res);

        // Header
        doc.fontSize(20).text('Zefender Machine List', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        // Table Header
        const startX = 30;
        let currentY = doc.y;

        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('ID', startX, currentY);
        doc.text('Name', startX + 100, currentY);
        doc.text('Location', startX + 220, currentY);
        doc.text('Status', startX + 380, currentY);
        doc.text('Owner', startX + 450, currentY);

        doc.moveDown();
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(startX, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.5);

        // Rows
        doc.font('Helvetica').fontSize(9);
        machines.forEach(m => {
            if (doc.y > 750) doc.addPage();
            currentY = doc.y;
            doc.text(m.machine_id.substring(0, 15), startX, currentY);
            doc.text(m.machine_name.substring(0, 20), startX + 100, currentY);
            doc.text((m.location || 'N/A').substring(0, 30), startX + 220, currentY);
            doc.text(m.status, startX + 380, currentY);
            doc.text(m.owner ? m.owner.username : 'N/A', startX + 450, currentY);
            doc.moveDown();
        });

        doc.end();

    } catch (error) {
        console.error(error);
        res.status(500).send('Error exporting PDF: ' + error.message);
    }
};
