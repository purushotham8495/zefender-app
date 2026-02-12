const { Op } = require('sequelize');

exports.getRangeStartDate = (range) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const now = new Date();

    switch (range) {
        case 'today':
            return today;
        case '7d':
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 7);
            return sevenDaysAgo;
        case '30d':
            const thirtyDaysAgo = new Date(now);
            thirtyDaysAgo.setDate(now.getDate() - 30);
            return thirtyDaysAgo;
        case '3m':
            const threeMonthsAgo = new Date(now);
            threeMonthsAgo.setMonth(now.getMonth() - 3);
            return threeMonthsAgo;
        case '6m':
            const sixMonthsAgo = new Date(now);
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            return sixMonthsAgo;
        case 'all':
            return new Date(0); // Epoch
        default:
            // Default to 7 days if unknown or not provided
            const defaultRange = new Date(now);
            defaultRange.setDate(now.getDate() - 7);
            return defaultRange;
    }
};

exports.getRangeLabel = (range) => {
    const labels = {
        'today': 'Today',
        '7d': 'Last 7 Days',
        '30d': 'Last 30 Days',
        '3m': 'Last 3 Months',
        '6m': 'Last 6 Months',
        'all': 'All Time'
    };
    return labels[range] || labels['7d'];
};
