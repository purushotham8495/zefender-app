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
        await Machine.create(req.body);
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
        // If owner_id is empty string, set it to null
        if (req.body.owner_id === '') req.body.owner_id = null;

        await Machine.update(req.body, { where: { id: req.params.id } });
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
}
