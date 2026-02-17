# 🚀 ORACLE CLOUD VM DEPLOYMENT GUIDE
**Zefender Application - Complete Setup**

## 📋 Prerequisites

### On Your Local Machine:
- ✅ Git installed
- ✅ SSH client (Windows: use PowerShell or PuTTY)
- ✅ Your Oracle Cloud VM IP address
- ✅ SSH private key for Oracle VM

### On Oracle Cloud Dashboard:
- ✅ VM instance running (Ubuntu 20.04+ recommended)
- ✅ Public IP assigned
- ✅ Firewall rules configured

---

## 🔐 STEP 1: Configure Oracle Cloud Firewall

### In Oracle Cloud Console:

1. **Go to:** Networking → Virtual Cloud Networks → Your VCN → Security Lists
2. **Add Ingress Rules:**

| Type | Source | Port | Description |
|------|--------|------|-------------|
| TCP  | 0.0.0.0/0 | 22 | SSH |
| TCP  | 0.0.0.0/0 | 80 | HTTP |
| TCP  | 0.0.0.0/0 | 443 | HTTPS |
| TCP  | 0.0.0.0/0 | 3000 | Node.js (Temporary) |

3. **Save the rules**

---

## 🖥️ STEP 2: Connect to Your Oracle VM

### From Windows PowerShell:

```powershell
# Replace with your details
ssh -i "C:\path\to\your-key.pem" ubuntu@YOUR_VM_IP

# Example:
# ssh -i "C:\Users\PM\.ssh\oracle-vm.pem" ubuntu@129.159.123.45
```

### Fix Key Permissions (if needed):
```powershell
# Windows: Right-click key file → Properties → Security
# Remove all users except yourself, set to Read-only
```

---

## 🛠️ STEP 3: Setup Server Environment

### Once connected via SSH, run these commands:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x

# Install PM2 globally
sudo npm install -g pm2

# Install build essentials
sudo apt install -y build-essential git

# Install Nginx
sudo apt install -y nginx

# Install MySQL/MariaDB (if needed locally)
# sudo apt install -y mysql-server
```

---

## 📁 STEP 4: Clone Your Application

```bash
# Create application directory
sudo mkdir -p /var/www
cd /var/www

# Clone from GitHub (if using Git)
sudo git clone https://github.com/YOUR_USERNAME/zefender-app.git
# OR upload via SCP (see below)

# Set ownership
sudo chown -R ubuntu:ubuntu /var/www/zefender-app
cd /var/www/zefender-app
```

### Alternative: Upload via SCP (from your local Windows):

```powershell
# From your local machine
scp -i "C:\path\to\your-key.pem" -r C:\Users\PM\Documents\hostingertest ubuntu@YOUR_VM_IP:/tmp/

# Then on the server:
sudo mv /tmp/hostingertest /var/www/zefender-app
sudo chown -R ubuntu:ubuntu /var/www/zefender-app
```

---

## ⚙️ STEP 5: Configure Environment

```bash
cd /var/www/zefender-app

# Create production .env file
nano .env
```

### Paste this configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Database Configuration (use your Hostinger MySQL credentials)
DB_HOST=srv2054.hstgr.io
DB_USER=u120899366_zefeender
DB_PASS=Zefender@0892
DB_NAME=u120899366_zefender
DB_DIALECT=mysql

# Webhook Secret (use generated secret from npm run generate:secrets)
RAZORPAY_WEBHOOK_SECRET=YOUR_GENERATED_SECRET_HERE

# Session Secret (use generated secret)
SESSION_SECRET=YOUR_GENERATED_SECRET_HERE

# Admin Credentials
ADMIN_USER=admin
ADMIN_PASS=YOUR_STRONG_PASSWORD_HERE

# Base URL (use your Oracle VM IP or domain)
BASE_URL=http://YOUR_VM_IP:3000
# After SSL setup: BASE_URL=https://yourdomain.com

# Timezone
TZ=Asia/Kolkata
```

**Save:** Press `Ctrl+X`, then `Y`, then `Enter`

---

## 📦 STEP 6: Install Dependencies

```bash
cd /var/www/zefender-app

# Install production dependencies
npm ci --production

# Build CSS if needed
npm run build:css
```

---

## 🚀 STEP 7: Start Application with PM2

```bash
# Start with PM2
pm2 start ecosystem.config.js --env production

# Setup PM2 to start on boot
pm2 startup
# Follow the command it outputs (usually sudo env PATH=...)
pm2 save

# Check status
pm2 status
pm2 logs zefender-app
```

### Test the application:
```bash
# From the server
curl http://localhost:3000

# From your browser
# Visit: http://YOUR_VM_IP:3000
```

---

## 🔧 STEP 8: Configure UFW Firewall (Server-level)

```bash
# Enable firewall
sudo ufw enable

# Allow SSH (IMPORTANT: Do this first!)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow Node.js port (temporary, until Nginx is set up)
sudo ufw allow 3000/tcp

# Check status
sudo ufw status verbose
```

---

## 🌐 STEP 9: Setup Nginx Reverse Proxy

### Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/zefender
```

### Paste this configuration:

```nginx
server {
    listen 80;
    server_name YOUR_VM_IP;  # Replace with your IP or domain

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Main proxy
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

    # Socket.io WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # File upload limit
    client_max_body_size 10M;
}
```

**Save:** `Ctrl+X`, `Y`, `Enter`

### Enable the site:

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/zefender /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl status nginx
```

### Update firewall:
```bash
# Now you can close port 3000 (traffic goes through Nginx)
sudo ufw delete allow 3000/tcp

# Verify
sudo ufw status
```

---

## 🔒 STEP 10: Setup SSL with Let's Encrypt (Optional but Recommended)

### If you have a domain name:

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# It will ask for:
# - Email address (for renewal notifications)
# - Agree to terms
# - Redirect HTTP to HTTPS (choose Yes)
```

### Update .env with HTTPS URL:
```bash
nano /var/www/zefender-app/.env
# Change: BASE_URL=https://yourdomain.com
```

### Restart application:
```bash
pm2 restart zefender-app
```

---

## 📊 STEP 11: Verify Deployment

### Check all services:

```bash
# Check PM2
pm2 status
pm2 logs zefender-app --lines 50

# Check Nginx
sudo systemctl status nginx

# Check firewall
sudo ufw status

# Test database connection
cd /var/www/zefender-app
node test_connection.js
```

### Access your application:

- **Without SSL:** http://YOUR_VM_IP
- **With SSL:** https://yourdomain.com

### Test functionality:
1. ✅ Login page loads
2. ✅ Admin can login
3. ✅ Dashboard displays
4. ✅ Machine list shows
5. ✅ ESP32 can connect (test with device)
6. ✅ Real-time updates work
7. ✅ Transactions are logged

---

## 🔄 STEP 12: Update/Redeploy Process

### When you need to update the application:

```bash
# SSH into server
ssh -i "your-key.pem" ubuntu@YOUR_VM_IP

# Navigate to app directory
cd /var/www/zefender-app

# Pull latest code (if using Git)
git pull origin main

# Install any new dependencies
npm ci --production

# Rebuild CSS if needed
npm run build:css

# Restart with zero downtime
pm2 reload ecosystem.config.js --update-env

# Or hard restart
pm2 restart zefender-app

# Check logs
pm2 logs zefender-app
```

---

## 🐛 TROUBLESHOOTING

### Application won't start:

```bash
# Check PM2 logs
pm2 logs zefender-app --lines 100

# Check if port is in use
sudo lsof -i :3000

# Try starting manually to see errors
cd /var/www/zefender-app
NODE_ENV=production node src/server.js
```

### Nginx errors:

```bash
# Check Nginx error log
sudo tail -f /var/log/nginx/error.log

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Database connection issues:

```bash
# Test from server
mysql -h srv2054.hstgr.io -u u120899366_zefeender -p

# Check .env file
cat /var/www/zefender-app/.env | grep DB_

# Test with Node
cd /var/www/zefender-app
node test_connection.js
```

### Firewall blocking connections:

```bash
# Check Oracle Cloud Console security lists
# Make sure ports 80, 443 are allowed

# Check UFW
sudo ufw status verbose

# Check if Nginx is listening
sudo netstat -tulpn | grep nginx
```

### ESP32 can't connect:

```bash
# Check if WebSocket is working
pm2 logs zefender-app | grep SOCKET

# Verify Nginx WebSocket proxy is configured
sudo nano /etc/nginx/sites-available/zefender
# Look for location /socket.io/ section

# Test WebSocket from browser console:
# const socket = io('http://YOUR_IP');
```

---

## 📊 MONITORING

### Setup monitoring:

```bash
# PM2 monitoring
pm2 monit

# Real-time logs
pm2 logs zefender-app --lines 100 --raw

# System resources
htop  # sudo apt install htop
```

### Log rotation:

```bash
# PM2 log rotation (built-in after pm2 save)
pm2 install pm2-logrotate

# Configure
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 🔐 SECURITY CHECKLIST

- [ ] SSH key-based authentication only (disable password login)
- [ ] UFW firewall enabled and configured
- [ ] Oracle Cloud security lists configured
- [ ] Strong passwords in .env
- [ ] SSL certificate installed (if using domain)
- [ ] Regular system updates: `sudo apt update && sudo apt upgrade`
- [ ] PM2 startup script configured
- [ ] Database credentials secured
- [ ] `.env` file permissions set: `chmod 600 .env`
- [ ] Nginx security headers configured

---

## 📞 QUICK REFERENCE

### Useful Commands:

```bash
# PM2
pm2 status                    # Check app status
pm2 logs zefender-app        # View logs
pm2 restart zefender-app     # Restart app
pm2 stop zefender-app        # Stop app
pm2 monit                    # Monitor resources

# Nginx
sudo systemctl status nginx      # Check status
sudo systemctl restart nginx     # Restart Nginx
sudo nginx -t                    # Test config
sudo tail -f /var/log/nginx/error.log

# System
sudo ufw status              # Check firewall
htop                        # Resource monitor
df -h                       # Disk space
free -m                     # Memory usage

# Application
cd /var/www/zefender-app
npm run pm2:logs            # View PM2 logs
npm run pm2:status          # Check status
```

---

## 🎯 POST-DEPLOYMENT

### After successful deployment:

1. **Update DNS** (if using domain)
   - Point A record to Oracle VM IP
   - Wait for propagation (up to 48 hours)

2. **Test ESP32 Connection**
   - Update ESP32 firmware with new server URL
   - Test device registration
   - Verify real-time control

3. **Monitor for 24 hours**
   - Check PM2 logs
   - Monitor CPU/Memory usage
   - Verify transaction logging

4. **Setup backups**
   - Database backups (daily)
   - Application code backups (Git)
   - Configuration backups (.env)

---

## 🆘 EMERGENCY CONTACTS

- **Oracle Cloud Support:** https://cloud.oracle.com/support
- **PM2 Documentation:** https://pm2.keymetrics.io/docs
- **Nginx Documentation:** https://nginx.org/en/docs

---

**Deployment Guide Version:** 1.0.0
**Last Updated:** 2026-02-17
**Target Platform:** Oracle Cloud Ubuntu VM
