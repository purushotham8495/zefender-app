# deploy-to-hostinger-via-github

## Step 1: Create GitHub Repository
1.  Go to [GitHub.com/new](https://github.com/new).
2.  Name it: `zefender-metrics` (or similar).
3.  Set it to **Public** or **Private** (Private recommended).
4.  Do **NOT** initialize with README/gitignore (we have them).
5.  Click **Create Repository**.

## Step 2: Push Local Code to GitHub
Open a terminal in `c:\Users\PM\Documents\hostingertest` and run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/zefender-metrics.git
git branch -M main
git push -u origin main
```
*(Replace `YOUR_USERNAME` and repo name).*

## Step 3: Deploy to Hostinger
1.  Log in to **Hostinger hPanel**.
2.  Go to **Advanced** > **GIT**.
3.  **Repository Address:** `https://github.com/YOUR_USERNAME/zefender-metrics.git`
    *   *If Private:* You need to create a `Deploy Key` on Hostinger and add it to GitHub Repo Settings > Deploy Keys.
4.  **Branch:** `main`
5.  **Directory:** `public_html` (Leave empty for root, or verify if it asks for subfolder).
    *   **CRITICAL:** Usually Hostinger expects the GIT repo to be the **Root of `public_html`**.
    *   Wait, Hostinger GIT deployment often requires an **Empty Directory**.
    *   **Alternative:** Use **Auto-Deploy** (Webhooks).

    **Easier Method (if directory not empty):**
    1.  Delete existing files in `public_html` (EXCEPT `.env`!!).
    2.  Use the GIT tool in hPanel to clone the repo into `public_html`.
    3.  **Re-create `.env`** file manually if deleted.
    4.  Run `npm install` in Node.js settings (or SSH).
    5.  Restart App.

## Step 4: Verify
1.  Check typical files: `public_html/src/server.js`.
2.  Check `.env`: It MUST exist with DB credentials.
3.  Check Logs: `stderr.log` for successful start.
