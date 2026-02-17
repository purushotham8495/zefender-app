# 🔄 UPDATE EXISTING ORACLE VM DEPLOYMENT
**Safe Update Guide for Running Application**
**Installation Path:** `/opt/zefender-app`

## 📋 PRE-UPDATE CHECKLIST

### Before you start:
- [ ] Note current application version/working state
- [ ] Have SSH access to Oracle VM
- [ ] Know the current installation path (usually `/opt/zefender-app`)
- [ ] Identify what's changed (UI, database, features, etc.)

---

## 🛡️ STEP 1: BACKUP CURRENT VERSION

### SSH into your Oracle VM:
```bash
ssh -i "C:\path\to\your-key.pem" ubuntu@YOUR_VM_IP
```

### Create backup:
```bash
# Navigate to application directory
cd /opt

# Stop the current application
pm2 stop zefender-app

# Create timestamped backup
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
sudo cp -r zefender-app zefender-app-backup-$BACKUP_DATE

# Verify backup
ls -lh | grep backup

# Optional: Backup database (if using local MySQL)
# mysqldump -u user -p database > backup_$BACKUP_DATE.sql
```

### Backup .env file separately (IMPORTANT):
```bash
cd /opt/zefender-app
cp .env .env.backup
cat .env  # Note your current settings
```

---

## 📦 STEP 2: UPLOAD NEW CODE

### Option A: Using Git (Recommended if you have Git repo)

```bash
cd /opt/zefender-app

# Check git remote
git remote -v

# If not configured, add it:
# git remote add origin https://github.com/YOUR_USERNAME/zefender-app.git

# Pull latest changes
git fetch origin
git pull origin main

# If there are conflicts with local changes:
git stash  # Save local changes
git pull origin main
# Review changes before applying stash back
```

### Option B: Upload via SCP (If no Git)

**From your Windows machine:**
```powershell
# Navigate to your local project
cd C:\Users\PM\Documents\hostingertest

# Create a zip file first (easier to transfer)
# Or use SCP to upload files

# Upload updated files to temp directory
scp -i "C:\path\to\your-key.pem" -r C:\Users\PM\Documents\hostingertest\src ubuntu@YOUR_VM_IP:/tmp/new-src
scp -i "C:\path\to\your-key.pem" C:\Users\PM\Documents\hostingertest\package.json ubuntu@YOUR_VM_IP:/tmp/
scp -i "C:\path\to\your-key.pem" C:\Users\PM\Documents\hostingertest\ecosystem.config.js ubuntu@YOUR_VM_IP:/tmp/
```

**Back on the Oracle VM:**
```bash
cd /opt/zefender-app

# Copy new files (preserving .env)
sudo rm -rf src.old
sudo mv src src.old
sudo mv /tmp/new-src src
sudo chown -R ubuntu:ubuntu src

# Update package.json
sudo mv package.json package.json.old
sudo mv /tmp/package.json .
sudo chown ubuntu:ubuntu package.json

# Update ecosystem config
sudo mv ecosystem.config.js ecosystem.config.js.old
sudo mv /tmp/ecosystem.config.js .
sudo chown ubuntu:ubuntu ecosystem.config.js
```

---

## ⚙️ STEP 3: UPDATE ENVIRONMENT CONFIGURATION

### Review and update .env:
```bash
cd /opt/zefender-app
nano .env
```

### Key updates needed (based on new code):
```env
# Make sure these are set correctly
NODE_ENV=production
BASE_URL=http://YOUR_VM_IP  # or https://yourdomain.com

# NEW: Add generated secrets (from npm run generate:secrets)
SESSION_SECRET=your_new_generated_secret
RAZORPAY_WEBHOOK_SECRET=your_new_generated_secret

# Verify database credentials are correct
DB_HOST=srv2054.hstgr.io
DB_USER=u120899366_zefeender
DB_PASS=Zefender@0892
DB_NAME=u120899366_zefender

# Admin credentials
ADMIN_USER=admin
ADMIN_PASS=Admin@123  # Consider changing to stronger password

# Timezone
TZ=Asia/Kolkata
```

**Save:** `Ctrl+X`, `Y`, `Enter`

---

## 📚 STEP 4: UPDATE DEPENDENCIES

```bash
cd /opt/zefender-app

# Remove old node_modules
rm -rf node_modules

# Install production dependencies
npm ci --production

# Build CSS assets
npm run build:css

# Check for vulnerabilities (optional)
npm audit
```

---

## 🗄️ STEP 5: DATABASE MIGRATIONS (if needed)

### Check if database needs updates:
```bash
cd /opt/zefender-app

# Test database connection
node test_connection.js

# The application will auto-migrate on startup, but you can verify:
# Check server.js for migration code (lines 90-140)
```

### Database changes in new version:
✅ **Transactions table:** Added governance columns  
✅ **Machines table:** Added `primary_sequence_id`, `actual_qr_url`, `test_qr_url`  
✅ **Machine logs table:** Created/verified

**These will be applied automatically when the app starts.**

---

## 🚀 STEP 6: RESTART APPLICATION

### Option A: Zero-Downtime Reload (Recommended)
```bash
cd /opt/zefender-app

# Reload with PM2 (keeps old version running until new is ready)
pm2 reload zefender-app --update-env

# Monitor startup
pm2 logs zefender-app --lines 50
```

### Option B: Full Restart
```bash
# Restart application
pm2 restart zefender-app

# Or restart with ecosystem config
pm2 restart ecosystem.config.js --update-env
```

### Check status:
```bash
pm2 status
pm2 logs zefender-app --lines 100
```

---

## ✅ STEP 7: VERIFY UPDATE

### 1. Check PM2 Status:
```bash
pm2 status
# Should show: online, with uptime starting fresh

pm2 logs zefender-app --lines 50
# Look for:
# - "Database synced"
# - "Server running on port 3000"
# - "Network Info"
# - No error messages
```

### 2. Test from Server:
```bash
# Test local connection
curl http://localhost:3000

# Should return HTML of login page
```

### 3. Test from Browser:
Visit: `http://YOUR_VM_IP` or `https://yourdomain.com`

### 4. Verify Key Features:
- [ ] ✅ Login page loads correctly
- [ ] ✅ Can login with admin credentials
- [ ] ✅ Dashboard displays all machines
- [ ] ✅ Machine cards show ONLINE/OFFLINE status with colors
- [ ] ✅ Can access machine control page
- [ ] ✅ Sequence steps show ON/OFF with green/red colors
- [ ] ✅ GPIO controls work
- [ ] ✅ Real-time updates work (test with ESP32)
- [ ] ✅ Transactions are logged
- [ ] ✅ Analytics page loads
- [ ] ✅ QR code upload works
- [ ] ✅ OTA update modal appears (admin only)
- [ ] ✅ Responsive design works on mobile

### 5. Test ESP32 Connection:
If you have an ESP32 device connected:
```bash
# Monitor socket connections
pm2 logs zefender-app | grep SOCKET

# You should see:
# - "Machine registered: MACHINE_ID"
# - "Heartbeat" messages
```

---

## 🐛 TROUBLESHOOTING

### Application won't start:

```bash
# Check detailed logs
pm2 logs zefender-app --lines 200

# Check for common issues:
# 1. Port already in use
sudo lsof -i :3000

# 2. Database connection error
node test_connection.js

# 3. Missing dependencies
npm ci --production

# 4. .env file issues
cat .env  # Verify all values are set
```

### Database migration errors:

```bash
# Check database connection
mysql -h srv2054.hstgr.io -u u120899366_zefeender -p

# If migrations fail, check logs:
pm2 logs zefender-app | grep migration
pm2 logs zefender-app | grep ERROR
```

### Nginx not serving updated content:

```bash
# Restart Nginx
sudo systemctl restart nginx

# Clear browser cache or use incognito mode
```

### Previous version was working, new version has issues:

See **ROLLBACK** section below ⬇️

---

## ⏮️ ROLLBACK PROCEDURE

### If something goes wrong, roll back to backup:

```bash
# Stop current version
pm2 stop zefender-app

# Restore backup (replace date with your backup)
cd /opt
sudo rm -rf zefender-app
sudo cp -r zefender-app-backup-YYYYMMDD_HHMMSS zefender-app
sudo chown -R ubuntu:ubuntu zefender-app

# Restore .env
cd /opt/zefender-app
cp .env.backup .env

# Restart old version
pm2 restart zefender-app

# Verify
pm2 logs zefender-app
```

### Test the rollback:
```bash
curl http://localhost:3000
# Open in browser to verify old version is working
```

---

## 🔍 POST-UPDATE MONITORING

### Monitor for the first hour after update:

```bash
# Real-time logs
pm2 logs zefender-app --raw

# Monitor resource usage
pm2 monit

# Check for errors
pm2 logs zefender-app | grep -i error

# System resources
htop  # or top
```

### Monitor for 24 hours:
- Check CPU/Memory usage (should be stable)
- Verify ESP32 connections remain stable
- Check transaction logging works
- Monitor error logs for any issues

---

## 📊 WHAT'S NEW IN THIS UPDATE

### UI Improvements:
✅ **Responsive Design** - Works on mobile, tablet, and desktop  
✅ **Color-Coded Status** - ONLINE (green) / OFFLINE (red) everywhere  
✅ **Sequence Steps** - ON steps (green), OFF steps (red)  
✅ **Better Buttons** - Improved layout and mobile optimization  
✅ **Fixed Overlaps** - Machine name no longer hidden by OTA button  
✅ **QR Modal** - Fixed responsiveness and upload feedback

### Backend Improvements:
✅ **Environment-Aware Logging** - Better logging for production  
✅ **PM2 Configuration** - Cluster mode, auto-restart  
✅ **Security Hardening** - .env protection, better secrets  
✅ **Production Scripts** - npm run pm2:*, generate:secrets, etc.

### Database:
✅ **Auto-Migrations** - Tables auto-update on startup  
✅ **New QR Columns** - actual_qr_url, test_qr_url  
✅ **Governance Support** - Additional transaction tracking

---

## 🎯 BEST PRACTICES

### After successful update:

1. **Document the change:**
   ```bash
   echo "$(date): Updated to v2.0 with responsive UI and color themes" >> /opt/UPDATE_LOG.txt
   ```

2. **Clean up old backups (after 1 week):**
   ```bash
   cd /opt
   # Keep only last 3 backups
   ls -t | grep backup | tail -n +4 | xargs sudo rm -rf
   ```

3. **Update Git (if using):**
   ```bash
   cd /opt/zefender-app
   git tag v2.0-$(date +%Y%m%d)
   git push origin --tags
   ```

4. **Schedule next update:** Plan updates during low-traffic hours

---

## 🚨 EMERGENCY CONTACTS

- **PM2 Issues:** `pm2 --help` or https://pm2.keymetrics.io/docs
- **Database Issues:** Check Hostinger support
- **Oracle VM Issues:** Oracle Cloud Console → Support

---

## 📝 UPDATE CHECKLIST

Use this for future updates:

- [ ] Backup current version
- [ ] Backup .env file
- [ ] Upload new code (Git or SCP)
- [ ] Update dependencies (npm ci)
- [ ] Build assets (npm run build:css)
- [ ] Update .env if needed
- [ ] Reload with PM2 (zero downtime)
- [ ] Verify logs for errors
- [ ] Test in browser (all features)
- [ ] Test ESP32 connection
- [ ] Monitor for 1 hour
- [ ] Document the update
- [ ] Celebrate! 🎉

---

**Update Guide Version:** 2.0.0  
**Date:** 2026-02-17  
**Tested On:** Oracle Cloud Ubuntu VM with PM2
