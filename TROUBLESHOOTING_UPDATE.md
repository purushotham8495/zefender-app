# 🔧 TROUBLESHOOTING: Website Not Updating

## 📋 Issue: Website shows old version after update

**Application Info:**
- Folder: `/opt/zefender-app`
- PM2 App Name: `zefender`

---

## 🔍 DIAGNOSTIC COMMANDS

Run these on your Oracle VM to identify the issue:

### 1. Check PM2 Status
```bash
pm2 status
pm2 describe zefender
```

### 2. Check if code was pulled
```bash
cd /opt/zefender-app
git log -1 --oneline
git status
```

### 3. Check PM2 logs for errors
```bash
pm2 logs zefender --lines 50
```

### 4. Check which version is running
```bash
cat /opt/zefender-app/package.json | grep version
```

---

## 🔄 SOLUTION: FORCE UPDATE & RESTART

### **STEP 1: Stop Application**
```bash
cd /opt/zefender-app
pm2 stop zefender
```

### **STEP 2: Verify Latest Code**
```bash
# Check current branch and status
git branch
git status

# If there are uncommitted changes, stash them
git stash

# Pull latest code
git fetch origin
git pull origin main --force

# Verify latest commit
git log -1
```

### **STEP 3: Clean Install Dependencies**
```bash
# Remove old node_modules and package-lock
rm -rf node_modules
rm -f package-lock.json

# Clean npm cache
npm cache clean --force

# Fresh install
npm install --production

# Or use ci (recommended)
npm ci --production
```

### **STEP 4: Build CSS Assets**
```bash
# Build frontend assets
npm run build:css

# Verify CSS was built
ls -lh src/public/css/output.css
```

### **STEP 5: Restart Application (Multiple Methods)**

**Option A: PM2 Restart (Recommended)**
```bash
# Hard restart
pm2 restart zefender --update-env

# Monitor startup
pm2 logs zefender --lines 100
```

**Option B: PM2 Reload (Zero Downtime)**
```bash
# Reload with environment update
pm2 reload zefender --update-env

# Check status
pm2 status
```

**Option C: Complete PM2 Restart**
```bash
# Delete and restart from ecosystem config
pm2 delete zefender
pm2 start ecosystem.config.js --env production

# Or start directly
pm2 start src/server.js --name zefender --env production
```

### **STEP 6: Clear Nginx Cache**
```bash
# Restart Nginx
sudo systemctl restart nginx

# Check Nginx status
sudo systemctl status nginx
```

### **STEP 7: Verify Update**
```bash
# Check PM2 is running
pm2 status

# Check logs for errors
pm2 logs zefender --lines 50 | grep -i error

# Should see:
# - "Database synced"
# - "Server running on port 3000"
# - No error messages
```

---

## 🌐 BROWSER-SIDE FIXES

### **Clear Browser Cache:**

1. **Hard Refresh:**
   - Chrome/Edge: `Ctrl + Shift + R` or `Ctrl + F5`
   - Firefox: `Ctrl + Shift + R`

2. **Incognito/Private Mode:**
   - Open website in incognito to bypass cache
   - Chrome: `Ctrl + Shift + N`
   - Firefox: `Ctrl + Shift + P`

3. **Clear Browser Cache:**
   - Chrome: Settings → Privacy → Clear browsing data
   - Check "Cached images and files"
   - Time range: "All time"

4. **Force Reload Specific Files:**
   - Open DevTools: `F12`
   - Right-click refresh button → "Empty Cache and Hard Reload"

---

## 🔍 VERIFICATION CHECKLIST

After restarting, verify these features work:

### **Visual Changes (New in v2.0):**
- [ ] Machine cards show green "ONLINE" or red "OFFLINE" badges
- [ ] Status badges have colored backgrounds (green/red tint)
- [ ] Sequence steps show green for "ON" and red for "OFF"
- [ ] Layout works on mobile (responsive)
- [ ] No text overlapping on machine cards
- [ ] Buttons are properly spaced and wrapped

### **Backend Changes:**
- [ ] PM2 logs show no errors
- [ ] Database migrations completed successfully
- [ ] All machines load on dashboard
- [ ] Real-time updates work (machine status)
- [ ] Transactions are logged

---

## 🐛 COMMON ISSUES & FIXES

### **Issue 1: PM2 says "online" but website not loading**

```bash
# Check if process is actually listening on port
sudo lsof -i :3000

# Check PM2 logs
pm2 logs zefender --err

# Test direct connection
curl http://localhost:3000
```

**Fix:**
```bash
pm2 restart zefender
```

---

### **Issue 2: "Module not found" errors**

```bash
# Check if node_modules exists
ls -la /opt/zefender-app/node_modules

# Reinstall dependencies
cd /opt/zefender-app
rm -rf node_modules
npm ci --production
pm2 restart zefender
```

---

### **Issue 3: CSS not updating**

```bash
# Check if output.css exists
ls -lh /opt/zefender-app/src/public/css/output.css

# Rebuild CSS
cd /opt/zefender-app
npm run build:css

# Verify file size changed
ls -lh src/public/css/output.css

# Restart
pm2 restart zefender
```

---

### **Issue 4: Database errors**

```bash
# Check database connection
cd /opt/zefender-app
node -e "const db = require('./src/config/database'); db.authenticate().then(() => console.log('✅ Connected')).catch(e => console.error('❌', e))"

# Check .env database credentials
cat .env | grep DB_
```

**Fix:**
```bash
# Update .env with correct credentials
nano .env
# Verify:
# DB_HOST=srv2054.hstgr.io
# DB_USER=u120899366_zefeender
# DB_PASS=Zefender@0892
# DB_NAME=u120899366_zefender

# Restart
pm2 restart zefender
```

---

### **Issue 5: Old code still running (PM2 not picking up changes)**

```bash
# Complete restart sequence
pm2 stop zefender
pm2 delete zefender

# Start fresh from ecosystem config
pm2 start /opt/zefender-app/ecosystem.config.js --env production

# OR start manually
cd /opt/zefender-app
pm2 start src/server.js \
  --name zefender \
  --instances max \
  --exec-mode cluster \
  --env production

# Save PM2 config
pm2 save
```

---

### **Issue 6: Nginx showing old content**

```bash
# Check Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Check if Nginx is caching
sudo nano /etc/nginx/sites-available/zefender
# Look for: proxy_cache

# If caching is enabled, clear cache:
sudo rm -rf /var/cache/nginx/*
sudo systemctl restart nginx
```

---

## 🎯 COMPLETE RESTART PROCEDURE

If nothing else works, do a complete clean restart:

```bash
# 1. Stop everything
pm2 stop zefender
sudo systemctl stop nginx

# 2. Clean application
cd /opt/zefender-app
rm -rf node_modules
git reset --hard origin/main
git pull origin main

# 3. Fresh install
npm ci --production
npm run build:css

# 4. Start services
sudo systemctl start nginx
pm2 start ecosystem.config.js --env production
pm2 save

# 5. Verify
pm2 status
pm2 logs zefender --lines 50
curl http://localhost:3000
```

---

## 📊 CHECK WHAT VERSION IS RUNNING

### **On Server:**
```bash
# Check git commit
cd /opt/zefender-app
git log -1 --oneline

# Check package.json
cat package.json | grep -A2 scripts

# Should see new scripts like:
# "pm2:start", "generate:secrets", etc.
```

### **Check PM2 Environment:**
```bash
pm2 describe zefender | grep -i "env"
pm2 env zefender
```

### **Check File Timestamps:**
```bash
# Check when views were last modified
ls -lt /opt/zefender-app/src/views/control/machine.ejs
ls -lt /opt/zefender-app/src/views/machines/index.ejs

# Should show recent dates (today)
```

---

## 🆘 NUCLEAR OPTION: Complete Reinstall

If absolutely nothing works:

```bash
# 1. Backup current working app (just in case)
sudo cp -r /opt/zefender-app /opt/zefender-app-old

# 2. Delete and re-clone
cd /opt
sudo rm -rf zefender-app
sudo git clone YOUR_GITHUB_REPO_URL zefender-app
sudo chown -R ubuntu:ubuntu zefender-app

# 3. Setup
cd zefender-app
cp /opt/zefender-app-old/.env .
npm ci --production
npm run build:css

# 4. Start
pm2 delete zefender
pm2 start ecosystem.config.js --env production
pm2 save
```

---

## 📞 QUICK COMMANDS SUMMARY

```bash
# Quick restart
cd /opt/zefender-app
git pull
npm ci --production
npm run build:css
pm2 restart zefender
pm2 logs zefender

# Check status
pm2 status
curl http://localhost:3000

# Hard refresh browser
# Ctrl + Shift + R
```

---

## ✅ SUCCESS INDICATORS

You'll know it worked when you see:

1. **PM2 Logs:**
   ```
   Database synced
   ✅ Transactions table migration complete
   ✅ Machines table migration complete
   Server running on port 3000
   ```

2. **Browser:**
   - Green "ONLINE" badges with green background
   - Red "OFFLINE" badges with red background
   - Sequence steps show colors (ON=green, OFF=red)
   - Layout is responsive on mobile

3. **No Errors:**
   ```bash
   pm2 logs zefender | grep -i error
   # Should return nothing or only old errors
   ```

---

**Last Updated:** 2026-02-17  
**PM2 App Name:** `zefender`  
**Installation Path:** `/opt/zefender-app`
