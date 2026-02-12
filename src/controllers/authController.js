const User = require('../models/user');
const bcrypt = require('bcryptjs');

exports.loginPage = (req, res) => {
    res.render('login', { error: null });
};

exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({
            where: {
                [require('sequelize').Op.or]: [
                    { username: username },
                    { email: username },
                    { phone: username }
                ]
            }
        });
        if (!user) {
            return res.render('login', { error: 'Invalid login credentials' });
        }
        const isValid = await user.validPassword(password);
        if (!isValid) {
            return res.render('login', { error: 'Invalid login credentials' });
        }

        if (user.status === 'blocked') {
            return res.render('login', { error: 'Your access has been revoked. Please contact the administrator.' });
        }

        req.session.user = { id: user.id, username: user.username, role: user.role };
        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.render('login', { error: 'Internal server error' });
    }
};

exports.logout = (req, res) => {
    req.session.destroy();
    res.redirect('/login');
};

exports.changePasswordPage = (req, res) => {
    res.render('change_password', { error: null, success: null });
};

exports.changePassword = async (req, res) => {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    try {
        if (newPassword !== confirmPassword) {
            return res.render('change_password', { error: 'New passwords do not match', success: null });
        }

        const user = await User.findByPk(req.session.user.id);
        const isValid = await user.validPassword(oldPassword);

        if (!isValid) {
            return res.render('change_password', { error: 'Incorrect current password', success: null });
        }

        // Update password (hooks will hash it)
        user.password = newPassword;
        await user.save(); // save() triggers hooks

        res.render('change_password', { error: null, success: 'Password updated successfully' });
    } catch (error) {
        console.error(error);
        res.render('change_password', { error: 'Server error', success: null });
    }
};
