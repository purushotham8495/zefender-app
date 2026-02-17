# 🚀 PRODUCTION DEPLOYMENT GUIDE
**Zefender Vending Machine Management System**

## 📋 Pre-Deployment Checklist

### 1. Generate Production Secrets
```bash
npm run generate:secrets
```
Copy the generated secrets to your production `.env` file.

### 2. Update Environment Variables
Edit `.env` file with production values:
```env
NODE_ENV=production
BASE_URL=https://admin.zefender.com
SESSION_SECRET=<generated_secret>
RAZORPAY_WEBHOOK_SECRET=<generated_secret>
ADMIN_PASS=<strong_password>
DB_PASS=<your_production_db_password>
```

### 3. Security Audit
```bash
npm run security:audit
```
Fix any critical or high vulnerabilities.

### 4. Build Assets
```bash
npm run build:css
```

---

## 🖥️ Server Setup (First Time)

### Install System Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install build essentials
sudo apt install -y build-essential
```

### Clone Repository
```bash
cd /var/www
sudo git clone https://github.com/your-repo/zefender-app.git
cd zefender-app
sudo chown -R $USER:$USER .
```

### Install Dependencies
```bash
npm ci --production
```

### Configure Environment
```bash
cp .env.example .env
nano .env  # Edit with your production values
```

---

## 🚀 Deployment Steps

### Method 1: Using PM2 (Recommended)

#### Start Application
```bash
npm run pm2:start
```

#### Setup PM2 Startup Script
```bash
pm2 startup
# Follow the command it outputs
pm2 save
```

#### Useful PM2 Commands
```bash
npm run pm2:status   # Check app status
npm run pm2:logs     # View logs
npm run pm2:restart  # Restart app
npm run pm2:stop     # Stop app
```

### Method 2: Using systemd

Create service file: `sudo nano /etc/systemd/system/zefender.service`
```ini
[Unit]
Description=Zefender Application
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/zefender-app
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=zefender

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable zefender
sudo systemctl start zefender
sudo systemctl status zefender
```

---

## 🔒 Nginx Reverse Proxy Setup

### Install Nginx
```bash
sudo apt install -y nginx
```

### Configure Site
Create: `sudo nano /etc/nginx/sites-available/zefender`
```nginx
server {
    listen 80;
    server_name admin.zefender.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin.zefender.com;

    # SSL Configuration (use certbot to generate)
    ssl_certificate /etc/letsencrypt/live/admin.zefender.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.zefender.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Socket.io support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Client max body size (for file uploads)
    client_max_body_size 10M;
}
```

### Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/zefender /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Setup SSL with Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d admin.zefender.com
```

---

## 🔥 Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

---

## 📊 Monitoring & Logging

### PM2 Monitoring
```bash
pm2 monit  # Real-time monitoring
```

### Log Files
```bash
# PM2 logs
tail -f logs/pm2-error.log
tail -f logs/pm2-out.log

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u zefender -f
```

### Setup Log Rotation
Create: `sudo nano /etc/logrotate.d/zefender`
```
/var/www/zefender-app/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

---

## 🔄 Update/Redeploy Process

### Standard Update
```bash
cd /var/www/zefender-app
git pull origin main
npm ci --production
npm run build:css
npm run pm2:restart
```

### Zero-Downtime Update (PM2 Cluster Mode)
```bash
cd /var/www/zefender-app
git pull origin main
npm ci --production
npm run build:css
pm2 reload ecosystem.config.js --update-env
```

---

## 🆘 Troubleshooting

### Application Won't Start
```bash
# Check PM2 logs
npm run pm2:logs

# Check system logs
sudo journalctl -u zefender -n 50

# Test manually
NODE_ENV=production node src/server.js
```

### Database Connection Issues
```bash
# Test database connection
node test_connection.js

# Check MySQL service
sudo systemctl status mysql

# Verify credentials in .env
```

### High Memory Usage
```bash
# Check PM2 status
npm run pm2:status

# Restart app
npm run pm2:restart

# Monitor memory
pm2 monit
```

### Socket.io Not Working
- Verify Nginx configuration includes Socket.io proxy
- Check firewall allows WebSocket connections
- Ensure `X-Forwarded-For` headers are set

---

## 📱 Health Checks

### Automated Health Check
```bash
curl https://admin.zefender.com/health
```

### Manual Checks
1. Visit https://admin.zefender.com
2. Login as admin
3. Check machine connections
4. Test GPIO controls
5. Verify transaction logging
6. Test OTA updates

---

## 🔐 Security Best Practices

1. **Keep system updated**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Regular security audits**
   ```bash
   npm run security:audit
   ```

3. **Monitor failed login attempts**
   ```bash
   tail -f csrf_errors.log
   ```

4. **Rotate secrets every 90 days**
   ```bash
   npm run generate:secrets
   ```

5. **Backup database daily**
   ```bash
   mysqldump -u user -p database > backup.sql
   ```

---

## 📞 Support

- **Documentation:** See PRODUCTION_READINESS_REPORT.md
- **Logs:** Check `/var/www/zefender-app/logs/`
- **PM2 Dashboard:** `pm2 monit`

---

**Last Updated:** 2026-02-17
**Version:** 1.0.0
