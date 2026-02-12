# Hostinger Node.js Deployment Guide (New Feature)

This guide uses Hostinger's dedicated **Node.js** feature in hPanel to host your application directly.

## Part 1: Deploying the Application

### 1. Prepare Your Files
Since you are deploying directly, we just need the source code.
1.  **Cleanup**: Ensure you have run the cleanup steps (done).
2.  **Zip the Project**:
    *   Select all files in `hostingertest` **EXCEPT**:
        *   `node_modules` (The Hostinger tool will install this for you)
        *   `firmware` (Not needed on the server)
        *   `.git`
    *   Create `zefender-app.zip`.

### 2. Upload Files
1.  Log in to **Hostinger hPanel**.
2.  Go to **Websites** and click **Manage** on your domain.
3.  Open **Files > File Manager**.
4.  Navigate to `public_html`.
5.  **Upload** your `zefender-app.zip`.
6.  **Extract** the zip content directly into `public_html` (or a subfolder if you prefer).
    *   *Result: You should see `src`, `package.json`, `.env`, etc., inside `public_html`.*

### 3. Configure Node.js Feature
1.  In hPanel, search for **"Node.js"** can click on it.
2.  **Application Root**: Enter the path where you extracted files (e.g., `public_html`).
3.  **Application Startup File**: Enter `src/server.js`.
4.  **Package.json Location**: Enter `public_html` (or same as Application Root).
5.  **Node.js Version**: Select **v18** or **v20** (LTS).
6.  Click **Create** or **Save**.

### 4. Install Dependencies (The "Direct" Way)
1.  Once saved, you will see a button labeled **"NPM Install"**.
2.  Click **NPM Install**.
    *   *Hostinger will read your `package.json` and install all required modules directly on the server.*

### 5. Final Configuration (CRITICAL STEPS)
1.  **Environment Variables**:
    *   Click the **"Add"** button in the "Environment variables" section.
    *   Copy/Paste all values from your local `.env`.
    *   **Add Timezone**: Key: `TZ`, Value: `Asia/Kolkata` (Fixes incorrect dates).
    *   **Update Base URL**: Set `BASE_URL` to your actual domain (e.g., `https://your-domain.com`).
2.  **Start Application**:
    *   Click the **Restart** (or Start) button in the Node.js dashboard.
3.  **Verify**:
    *   Click **Open Website**. You should see your Zefender login page.

---

## Part 2: Razorpay Webhook Configuration

For payments to work on production, you **must** update the webhook URL in your Razorpay Dashboard.

**Your Webhook URL:**
```
https://your-domain.com/api/webhooks/razorpay
```
*(Replace `your-domain.com` with your actual Hostinger domain)*

1.  Log in to **Razorpay Dashboard**.
2.  Go to **Settings > Webhooks**.
3.  Click **+ Add New Webhook**.
4.  **Webhook URL**: Enter the URL above.
5.  **Secret**: Enter the `RAZORPAY_WEBHOOK_SECRET` from your `.env` (e.g., `Zefender@0892`).
6.  **Active Events**: Select `payment.captured` and `payment.failed`.
7.  Click **Create Webhook**.

---

## Part 3: ESP32 Firmware Configuration

The physical machines need to know where your new "direct" hosted app is.

### Changes Required in `firmware/esp32_control_wrover.ino`

1.  **Open Firmware**: Open `firmware/esp32_control_wrover.ino`.
2.  **Update CONFIG Section** (Lines 24-37):

```cpp
// 1. WiFi Credentials (For the machine's location)
#define WIFI_SSID       "Your_Actual_Wifi_Name"
#define WIFI_PASSWORD   "Your_Actual_Wifi_Password"

// 2. Server Connection (Your Hostinger Domain)
// DO NOT use "https://" or slashes "/"
char host[] = "your-domain.com"; 

// 3. Port (Standard Web Port)
// Use 80 for HTTP. Hostinger usually handles 80 -> 443 redirection automatically.
int port = 80;
```

3.  **Flash**: Upload this updated code to your ESP32.

---

## Part 4: Troubleshooting

*   **Wrong Time/Dates**:
    *   Ensure you added the `TZ` variable with value `Asia/Kolkata` in the Node.js Environment Variables section.
*   **"Application Error" / 500 or 503**:
    *   Go to **Node.js** in hPanel.
    *   Check if "Application Status" is "Enabled".
    *   Click **Restart**.
*   **Database Errors**:
    *   Verify `.env` has the correct `DB_HOST=srv2054.hstgr.io`.

*   **ESP32 "[SIoC] Disconnected!" Loop**:
    *   **Port Confusion**: You MUST keep `PORT 3000` in your Hostinger Environment Variables (creates the server).
    *   **ESP32 Port**: Try `int port = 80;` first.
    *   **HTTPS Issue**: If Hostinger forces HTTPS (redirects port 80 to 443), your ESP32 might disconnect immediately.
        *   **Fix**: Change to `int port = 443;` and ensure you are using `WiFiClientSecure` in your code if supported, OR contact Hostinger support to "Disable HTTPS Force" for your temporary domain.
        *   *Alternative*: Use `http://` prefix in `host` string if using a library that parses it, but `SocketIoClient` usually expects just the domain.

*   **ESP32 "403 Forbidden" Error**:
    *   **Fix 1 (ModSecurity)**: Search "ModSecurity" in hPanel search bar. If found, **Disable** it.
    *   **Fix 2 (IP Whitelist - If ModSecurity hidden)**:
        1.  Go to **Advanced** > **IP Manager**.
        2.  Find your ESP32's public IP (google "what is my ip" on that network).
        3.  Enter it in **Allow an IP Address** and click **Add**.
## Final Verification Checklist
1.  **Website Functional**: Visit `http://antiquewhite-...` (or your domain). It should load without 500/503 errors.
2.  **Server Fix Deployed**: Ensure `public_html/src/utils/socketManager.js` has `const MachineGPIO = ...` at the top AND `console.error('[SOCKET] Machine registered...');` inside.
3.  **ESP32 Config**:
    *   `host`: Your domain.
    *   `port`: 80.
    *   `path`: `/socket.io/`.
4.  **Firewall Bypass**: Ensure `.htaccess` has `SecFilterEngine Off`.

## Debug ESP32 Connection
**Step 1: Clear Logs**
1.  Delete `public_html/stderr.log`.
2.  Restart Node App.
3.  Wait 1 minute (for ESP32 to try connecting).

**Step 2: Check Logs**
Open the **NEW** `stderr.log`.
*   **Scenario A: Log is Empty**.
    *   **Cause**: You didn't deploy my `socketManager.js` fix.
    *   **Fix**: Upload `src/utils/socketManager.js` again.
*   **Scenario B: Log says `[SOCKET] Machine registered: ...`**.
    *   **Result**: IT WORKS! The ESP32 connected.
*   **Scenario C: Log says `Access Denied`**.
    *   **Fix**: Fix `.env` file (Database password).

*   **"Access denied for user ''@'::1' (using password: NO)" Error (AGAIN?)**:
    *   **Cause**: You switched domains or deleted the file. The `.env` file is missing in the **CURRENT** domain's folder.
    *   **Fix**:
        1.  Go to **File Manager**.
        2.  Check the path: `domains/antiquewhite-quetzal.../public_html` (or your active domain).
        3.  **Create `.env`** file HERE.
        4.  Paste credentials.
        5.  **Restart App**.
    *   **Note**: Logs show you are using the `antiquewhite...` domain now. Ensure `.env` is THERE.
