# Oracle Cloud Deployment Guide (Nginx + Node.js)

Since you have a fresh Oracle VM with Nginx installed, here is the exact guide to getting your application running and connected entirely.

## 1. Prepare your VM

1.  **SSH into your Oracle VM**:
    ```bash
    ssh -i your_key.pem ubuntu@80.225.221.91
    ```

2.  **Install Node.js & Database**:
    ```bash
    # Update
    sudo apt update
    sudo apt install -y curl git make build-essential

    # Install Node.js 18
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    
    # Check
    node -v 
    
    # Install SQLite/MySQL (If using MySQL)
    # sudo apt install -y mysql-server
    ```

## 2. Deploy Code

1.  **Copy your code** (You can use Git or SCP).
    ```bash
    # Example using Git
    git clone <YOUR_REPO_URL> zefender-app
    cd zefender-app
    
    # Install Dependencies
    npm install
    
    # Setup .env
    cp .env.example .env
    nano .env
    # -> Set PORT=3000
    # -> Set DB credentials
    ```

## 3. Configure Nginx (Reverse Proxy)

This is the **most critical step** for Socket.IO connection.

1.  **Edit Nginx Config**:
    ```bash
    sudo nano /etc/nginx/sites-available/default
    ```

2.  **Replace content with this**:
    ```nginx
    server {
        listen 80;
        server_name _; # Or your domain if you have one

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        # IMPORTANT: Socket.IO handling
        location /socket.io/ {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

3.  **Restart Nginx**:
    ```bash
    sudo service nginx restart
    ```

## 4. Run Application

1.  **Install PM2** (Production Process Manager):
    ```bash
    sudo npm install -g pm2
    ```

2.  **Start your app**:
    ```bash
    cd ~/zefender-app
    pm2 start src/server.js --name zefender
    pm2 save
    pm2 startup
    ```

## 5. Firewall Config (Oracle Cloud)

Oracle Cloud has a strict firewall in the dashboard.
1.  Go to **Oracle Cloud Console** -> **Networking** -> **VCN** -> **Security Lists**.
2.  Edit the **Ingress Rules**.
3.  Add Rule:
    *   **Source**: `0.0.0.0/0`
    *   **Protocol**: TCP
    *   **Destination Port Range**: `80` (and `443` if using SSL later).
4.  Also allow port 80 in Ubuntu firewall (iptables):
    ```bash
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
    sudo netfilter-persistent save
    ```

---

## 6. ESP32 Config

I have already updated your `esp32_control_wrover.ino` to point to `80.225.221.91` on Port 80.
**Flash the ESP32 now**, and once your server is running, it should connect immediately!
