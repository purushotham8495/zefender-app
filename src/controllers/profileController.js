const User = require('../models/user');
const bcrypt = require('bcryptjs');

// Show profile page
exports.showProfile = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        // Fetch fresh user data from database
        const userData = await User.findByPk(user.id);
        if (!userData) {
            return res.redirect('/login');
        }

        res.render(user.role === 'admin' ? 'admin/profile' : 'users/profile', {
            user: userData,
            csrfToken: req.csrfToken(),
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.status(500).send('Error loading profile');
    }
};

// Update profile information
exports.updateProfile = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const { username, email, phone } = req.body;

        // Validate input
        if (!username || !email) {
            const redirectUrl = user.role === 'admin' ? '/admin/profile' : '/users/profile';
            return res.redirect(`${redirectUrl}?error=${encodeURIComponent('Username and email are required')}`);
        }

        // Check if email is already taken by another user
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser && existingUser.id !== user.id) {
            const redirectUrl = user.role === 'admin' ? '/admin/profile' : '/users/profile';
            return res.redirect(`${redirectUrl}?error=${encodeURIComponent('Email already in use')}`);
        }

        // Update user
        await User.update(
            { username, email, phone },
            { where: { id: user.id } }
        );

        // Update session
        req.session.user = { ...user, username, email, phone };

        const redirectUrl = user.role === 'admin' ? '/admin/profile' : '/users/profile';
        res.redirect(`${redirectUrl}?success=${encodeURIComponent('Profile updated successfully')}`);
    } catch (error) {
        console.error('Error updating profile:', error);
        const redirectUrl = req.session.user.role === 'admin' ? '/admin/profile' : '/users/profile';
        res.redirect(`${redirectUrl}?error=${encodeURIComponent('Failed to update profile')}`);
    }
};

// Change password
exports.changePassword = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validate input
        if (!currentPassword || !newPassword || !confirmPassword) {
            const redirectUrl = user.role === 'admin' ? '/admin/profile' : '/users/profile';
            return res.redirect(`${redirectUrl}?error=${encodeURIComponent('All password fields are required')}`);
        }

        if (newPassword !== confirmPassword) {
            const redirectUrl = user.role === 'admin' ? '/admin/profile' : '/users/profile';
            return res.redirect(`${redirectUrl}?error=${encodeURIComponent('New passwords do not match')}`);
        }

        if (newPassword.length < 6) {
            const redirectUrl = user.role === 'admin' ? '/admin/profile' : '/users/profile';
            return res.redirect(`${redirectUrl}?error=${encodeURIComponent('Password must be at least 6 characters')}`);
        }

        // Verify current password
        const userData = await User.findByPk(user.id);
        const isValidPassword = await bcrypt.compare(currentPassword, userData.password);

        if (!isValidPassword) {
            const redirectUrl = user.role === 'admin' ? '/admin/profile' : '/users/profile';
            return res.redirect(`${redirectUrl}?error=${encodeURIComponent('Current password is incorrect')}`);
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await User.update(
            { password: hashedPassword },
            { where: { id: user.id } }
        );

        const redirectUrl = user.role === 'admin' ? '/admin/profile' : '/users/profile';
        res.redirect(`${redirectUrl}?success=${encodeURIComponent('Password changed successfully')}`);
    } catch (error) {
        console.error('Error changing password:', error);
        const redirectUrl = req.session.user.role === 'admin' ? '/admin/profile' : '/users/profile';
        res.redirect(`${redirectUrl}?error=${encodeURIComponent('Failed to change password')}`);
    }
};
