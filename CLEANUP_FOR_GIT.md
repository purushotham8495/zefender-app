# 🧹 PRODUCTION CLEANUP CHECKLIST

## ❌ FILES TO DELETE (NOT NEEDED FOR PRODUCTION)

### 1. **Development/Test Files:**
```
❌ csrf_errors.log           # Local development logs
❌ database.sqlite           # Local SQLite database (production uses MySQL)
❌ test_connection.js        # Development test script
❌ start_app.bat            # Windows batch file (not used on Linux server)
```

### 2. **Duplicate/Old Documentation:**
```
❌ DEPLOYMENT.md            # Old/redundant deployment guide
❌ GITHUB_DEPLOYMENT.md     # Old GitHub-specific guide  
❌ HOSTINGER_DEPLOYMENT.md  # Old Hostinger guide
❌ ORACLE_DEPLOY.md         # Old Oracle guide (replaced by ORACLE_CLOUD_DEPLOYMENT.md)
```

### 3. **Environment Files (DO NOT COMMIT):**
```
❌ .env                     # Contains production secrets - NEVER commit
                            # Already in .gitignore, but verify
```

### 4. **Build Artifacts (Auto-generated):**
```
❌ node_modules/            # Dependencies (already gitignored)
❌ logs/                    # Log files (already gitignored)
```

---

## ✅ FILES TO KEEP (REQUIRED FOR PRODUCTION)

### **Root Level:**
```
✅ .env.example             # Template for environment setup
✅ .gitignore              # Git ignore rules
✅ ecosystem.config.js     # PM2 production configuration
✅ package.json            # Dependencies and scripts
✅ package-lock.json       # Locked dependency versions
✅ README.md               # Project documentation
```

### **Documentation (Keep These - They're Useful):**
```
✅ ORACLE_CLOUD_DEPLOYMENT.md      # Oracle VM deployment guide
✅ UPDATE_DEPLOYMENT.md            # Update/redeploy guide
✅ PRODUCTION_READINESS_REPORT.md  # Security audit & checklist
✅ PRODUCTION_DEPLOYMENT.md        # General production guide
```

### **Source Code (src/):**
```
✅ src/config/             # Database configuration
✅ src/controllers/        # Business logic
✅ src/middleware/         # Auth, CSRF, etc.
✅ src/models/            # Database models
✅ src/public/            # Static assets (CSS, images)
✅ src/routes/            # API & web routes
✅ src/server.js          # Main application entry
✅ src/utils/             # Helper functions, socketManager
✅ src/views/             # EJS templates
```

### **Scripts:**
```
✅ scripts/generate-secrets.js  # Production secret generator
✅ scripts/seed.js             # Database seeding
```

### **Firmware (if needed):**
```
✅ firmware/               # ESP32 firmware files for OTA updates
```

---

## 🗑️ CLEANUP COMMANDS

### **Option 1: Manual Delete (Recommended - Review First)**

```powershell
# From Windows PowerShell in project directory
cd C:\Users\PM\Documents\hostingertest

# Delete log files
Remove-Item csrf_errors.log -ErrorAction SilentlyContinue

# Delete test database
Remove-Item database.sqlite -ErrorAction SilentlyContinue

# Delete test scripts
Remove-Item test_connection.js -ErrorAction SilentlyContinue

# Delete Windows batch file
Remove-Item start_app.bat -ErrorAction SilentlyContinue

# Delete old/duplicate documentation
Remove-Item DEPLOYMENT.md -ErrorAction SilentlyContinue
Remove-Item GITHUB_DEPLOYMENT.md -ErrorAction SilentlyContinue
Remove-Item HOSTINGER_DEPLOYMENT.md -ErrorAction SilentlyContinue
Remove-Item ORACLE_DEPLOY.md -ErrorAction SilentlyContinue

# Verify .env is NOT being tracked by git
git status
# If .env appears, make sure .gitignore has it
```

### **Option 2: Use Cleanup Script (Run from project root)**

Create and run: `cleanup-for-production.ps1`

---

## 📦 PREPARE FOR GIT PUSH

### **1. Verify .gitignore is Correct:**

```powershell
# Check current .gitignore
Get-Content .gitignore
```

Should include:
```
.env
node_modules/
*.log
*.db
database.sqlite
logs/
```

### **2. Check Git Status:**

```powershell
git status
```

**✅ Should see (GREEN):**
- Modified files in `src/`
- New/modified `.md` files
- `ecosystem.config.js`
- `package.json`
- `.gitignore`
- `.env.example`

**❌ Should NOT see (if these appear, they're not gitignored):**
- `.env` 
- `node_modules/`
- `*.log` files
- `database.sqlite`

### **3. Review Changes:**

```powershell
# See what files changed
git diff --name-only

# See detailed changes in a specific file
git diff src/views/control/machine.ejs
```

### **4. Stage Files for Commit:**

```powershell
# Add all changed files
git add .

# Or add specific files only
git add src/
git add package.json
git add ecosystem.config.js
git add .env.example
git add *.md
git add scripts/
```

### **5. Commit Changes:**

```powershell
git commit -m "Update: Responsive UI, color themes, production readiness

- Added responsive design for mobile/tablet/desktop
- Implemented green/red color coding for ONLINE/OFFLINE status
- Added color themes for sequence ON/OFF steps
- Fixed UI overlaps and button layouts
- Updated environment configuration for production
- Added PM2 ecosystem config
- Generated secure secrets mechanism
- Improved logging for production
- Added comprehensive deployment guides
- Security hardening and production readiness checks"
```

### **6. Push to Remote:**

```powershell
# Push to main branch
git push origin main

# Or if you use master
git push origin master

# Create a version tag (optional)
git tag v2.0.0
git push origin v2.0.0
```

---

## 🔒 SECURITY CHECK BEFORE PUSH

### **Critical: Ensure No Secrets Are Committed**

```powershell
# Search for potential secrets in files to be committed
git grep -i "password" $(git diff --cached --name-only)
git grep -i "secret" $(git diff --cached --name-only)
git grep -i "db_pass" $(git diff --cached --name-only)

# Check .env is not staged
git diff --cached --name-only | Select-String ".env"
# Should return nothing or only .env.example
```

**If you find secrets:**
```powershell
# Unstage the file
git reset HEAD <file-with-secrets>

# Remove secrets from the file
# Re-add the file
git add <file>
```

---

## 📊 FINAL FILE STRUCTURE (After Cleanup)

```
zefender-app/
├── .env.example                    ✅ Template
├── .gitignore                      ✅ Git rules
├── ecosystem.config.js             ✅ PM2 config
├── package.json                    ✅ Dependencies
├── package-lock.json               ✅ Locked versions
├── README.md                       ✅ Docs
├── ORACLE_CLOUD_DEPLOYMENT.md      ✅ Deployment guide
├── UPDATE_DEPLOYMENT.md            ✅ Update guide
├── PRODUCTION_READINESS_REPORT.md  ✅ Audit report
├── PRODUCTION_DEPLOYMENT.md        ✅ Production guide
├── firmware/                       ✅ ESP32 firmware
├── scripts/
│   ├── generate-secrets.js         ✅ Secret generator
│   └── seed.js                     ✅ Database seed
└── src/
    ├── config/                     ✅ Configuration
    ├── controllers/                ✅ Business logic
    ├── middleware/                 ✅ Auth/CSRF
    ├── models/                     ✅ Database models
    ├── public/                     ✅ Static assets
    ├── routes/                     ✅ Routes
    ├── server.js                   ✅ Main app
    ├── utils/                      ✅ Utilities
    └── views/                      ✅ Templates
```

---

## 🎯 POST-CLEANUP VERIFICATION

```powershell
# Count files being tracked
git ls-files | Measure-Object -Line

# Verify no large files
git ls-files | ForEach-Object { Get-Item $_ } | Where-Object { $_.Length -gt 1MB } | Select-Object Name, Length

# Check repository size
git count-objects -vH
```

---

## ✅ CLEANUP CHECKLIST

Before pushing to Git:

- [ ] Deleted `csrf_errors.log`
- [ ] Deleted `database.sqlite`
- [ ] Deleted `test_connection.js`
- [ ] Deleted `start_app.bat`
- [ ] Deleted old deployment guides (4 files)
- [ ] Verified `.env` is in `.gitignore`
- [ ] Verified `.env` is NOT staged for commit
- [ ] Checked `git status` - no secrets visible
- [ ] Reviewed all changes with `git diff`
- [ ] Committed with clear message
- [ ] Ready to push to remote

---

**Cleanup Version:** 1.0.0  
**Date:** 2026-02-17
