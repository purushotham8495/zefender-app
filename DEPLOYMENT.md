# Deployment Guide - Zefender

This application is built with Node.js (Express), MySQL, and Tailwind CSS. It is designed to be deployed on Hostinger or any VPS/Cloud provider.

## Prerequisites

- **Node.js** (v16+)
- **MySQL Database**
- **NPM**

## Local Setup

1.  **Clone Repository**
    ```bash
    git clone <repo_url>
    cd zefender
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    - Rename `.env.example` to `.env` (or create one).
    - Update credentials:
      ```env
      PORT=3000
      DB_HOST=103.86.105.66
      DB_USER=u120899366_zefender
      DB_PASS=Zefender@0892
      DB_NAME=u120899366_zefender
      RAZORPAY_WEBHOOK_SECRET=your_secret_here
      SESSION_SECRET=random_string
      ```

4.  **Run Migrations & Seed**
    - This will create tables and add a default admin (`admin` / `Admin@123`).
    ```bash
    node scripts/seed.js
    ```

5.  **Start Server**
    ```bash
    npm run dev
    ```
    - Access at `http://localhost:3000`.

## Hostinger Deployment (Shared Hosting)

Hostinger supports Node.js on many plans via the "Node.js" section in hPanel.

1.  **Create Database**
    - Go to **Databases** > **MySQL Databases**.
    - Create a new database and user (or use existing provided credentials).

2.  **Setup Node.js App**
    - Go to **Advanced** > **Node.js** (or similar section).
    - **Create Application**:
        - **Node.js Version**: 18 or Latest.
        - **Application Mode**: Production.
        - **Application Root**: `public_html/zefender` (or wherever you upload).
        - **Application URL**: `yourdomain.com/`.
        - **Application Startup File**: `src/server.js`.
    - Click **Create**.

3.  **Upload Files**
    - Use FTP (FileZilla) or File Manager to upload project files to the "Application Root" directory.
    - **Exclude**: `node_modules`.

4.  **Install Dependencies**
    - In the Node.js App section, click **Enter to Virtual Environment** (provides command to run in terminal/SSH).
    - OR use the "NPM Install" button if available.
    - If using SSH:
      ```bash
      cd public_html/zefender
      npm install
      ```

5.  **Environment Variables**
    - Create a `.env` file in the root directory with your production credentials.

6.  **Start App**
    - In hPanel Node.js section, click **Restart**.

## Webhook Setup (Razorpay)

1.  Login to Razorpay Dashboard.
2.  Go to **Settings** > **Webhooks**.
3.  **Add New Webhook**:
    - **Webhook URL**: `https://yourdomain.com/api/webhooks/razorpay`
    - **Secret**: Match the `RAZORPAY_WEBHOOK_SECRET` in `.env`.
    - **Active Events**: `payment.captured`, `payment.failed`.
4.  Save.

## Troubleshooting

- **500 Error**: Check `stderr.log` or generic error logs in Hostinger. Ensure `.env` is correct.
- **Database Connection**: Ensure `DB_HOST` is `localhost` if the DB is on the same server, or the specific IP if remote. (Prompt IP `103.86.105.66` suggests remote/external access or specific IP assignment).
- **Static Files**: In Hostinger, you might need to configure `.htaccess` to offload static file serving to Apache/Nginx instead of Node for performance, or ensure Express `static` middleware is working. For simple apps, Express serving static is fine.

## Security Notes

- **Change Admin Password**: Login and update password immediately.
- **HTTPS**: Enable SSL in Hostinger (Let's Encrypt).
