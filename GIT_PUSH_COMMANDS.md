# 🚀 GIT PUSH COMMANDS - READY TO EXECUTE

## ⚠️ CRITICAL: DO NOT COMMIT .ENV FILE

The `.env` file is showing as modified. We need to restore it to prevent secrets from being committed.

## 📋 STEP-BY-STEP GIT COMMANDS

### 1. **Restore .env to prevent committing secrets**
```powershell
git restore .env
```

### 2. **Add all changes EXCEPT .env**
```powershell
# Add deleted files
git add -u

# Add new/modified documentation
git add CLEANUP_FOR_GIT.md
git add ORACLE_CLOUD_DEPLOYMENT.md
git add PRODUCTION_DEPLOYMENT.md
git add PRODUCTION_READINESS_REPORT.md
git add UPDATE_DEPLOYMENT.md
git add ecosystem.config.js

# Add new scripts
git add scripts/generate-secrets.js

# Add modified source files
git add src/
git add package.json
git add package-lock.json
git add .gitignore
git add .env.example

# Add cleanup script (optional - for future use)
git add cleanup-production.ps1
```

### 3. **Verify .env is NOT staged**
```powershell
git status
```

**YOU SHOULD SEE:**
- ✅ `.env` appears ONLY under "Changes not staged" (in RED) - GOOD!
- ❌ `.env` appears under "Changes to be committed" (in GREEN) - BAD! Run step 1 again

### 4. **Review what will be committed**
```powershell
# See list of files to be committed
git diff --cached --name-only

# Double-check no secrets are being committed
git diff --cached | Select-String -Pattern "SESSION_SECRET|DB_PASS|ADMIN_PASS"
```

**If you see any secrets, STOP and run:**
```powershell
git reset HEAD .env
git restore .env
```

### 5. **Commit the changes**
```powershell
git commit -m "v2.0: Responsive UI, Production Readiness & Color Themes

Major Updates:
- ✨ Responsive design for mobile/tablet/desktop
- 🎨 Green/Red color coding for ONLINE/OFFLINE status  
- 🎯 Sequence steps with ON (green) / OFF (red) themes
- 📱 Fixed UI overlaps and mobile button layouts
- 🔒 Production security hardening
- 🚀 PM2 ecosystem configuration
- 📚 Comprehensive deployment guides
- 🔐 Secure secret generation
- 📊 Enhanced logging for production
- 🧹 Cleaned up development files

Breaking Changes:
- Database auto-migrations on startup
- New environment variables required (see .env.example)
- Installation path: /opt/zefender-app

Deployment:
- See ORACLE_CLOUD_DEPLOYMENT.md for fresh install
- See UPDATE_DEPLOYMENT.md for updating existing deployment"
```

### 6. **Push to remote repository**
```powershell
# Push to main branch
git push origin main
```

### 7. **Create version tag (optional but recommended)**
```powershell
git tag -a v2.0.0 -m "Version 2.0.0 - Responsive UI & Production Ready"
git push origin v2.0.0
```

---

## ✅ VERIFICATION CHECKLIST

After pushing, verify:

- [ ] Visit GitHub/GitLab repository in browser
- [ ] Check that `.env` file is NOT in the repository
- [ ] Verify `.env.example` IS in the repository
- [ ] Check that `node_modules/` is NOT in the repository
- [ ] Verify `*.log` files are NOT in the repository
- [ ] Confirm all documentation files are present
- [ ] Review the commit on GitHub to ensure no secrets visible

---

## 🔄 NEXT STEP: UPDATE ORACLE VM

After successful push to Git, update your Oracle VM:

```bash
# SSH into Oracle VM
ssh -i "your-key.pem" ubuntu@YOUR_VM_IP

# Navigate to application
cd /opt/zefender-app

# Backup current version
pm2 stop zefender-app
sudo cp -r /opt/zefender-app /opt/zefender-app-backup-$(date +%Y%m%d_%H%M%S)

# Pull latest code
git pull origin main

# Update dependencies
npm ci --production

# Build CSS
npm run build:css

# Restart application
pm2 reload zefender-app --update-env

# Monitor logs
pm2 logs zefender-app
```

**Follow complete steps in:** `UPDATE_DEPLOYMENT.md`

---

## 🆘 IF SOMETHING GOES WRONG

### If you accidentally committed .env:

```powershell
# Remove .env from last commit (before pushing)
git reset --soft HEAD~1
git restore --staged .env
git restore .env  
git commit -m "Your commit message"

# If already pushed (URGENT - do immediately)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

git push origin main --force

# Then rotate all secrets immediately:
# - Change DATABASE_PASSWORD
# - Generate new SESSION_SECRET
# - Generate new WEBHOOK_SECRET
```

### If push is rejected:

```powershell
# Pull latest changes first
git pull origin main --rebase

# Then push
git push origin main
```

---

**Ready to execute!**  
Copy commands one by one, starting from step 1.
