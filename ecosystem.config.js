module.exports = {
    apps: [{
        name: 'zefender-app',
        script: './src/server.js',
        instances: 'max', // Use all CPU cores
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'development',
            PORT: 3000
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        max_memory_restart: '500M',
        autorestart: true,
        watch: false,
        max_restarts: 10,
        min_uptime: '10s',
        listen_timeout: 3000,
        kill_timeout: 5000,
        restart_delay: 4000
    }]
};
