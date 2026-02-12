# Zefender - IoT Machine Control & Management Platform

A comprehensive web-based platform for managing and controlling IoT-enabled machines (ESP32) with real-time monitoring, payment integration, and analytics.

## Features

### 🎛️ Machine Control
- Real-time machine control via WebSocket (Socket.IO)
- GPIO pin control (up to 10 pins)
- Sequence automation (multi-step workflows)
- Live status monitoring
- Network information display
- OTA firmware updates

### 👥 User Management
- Admin dashboard
- Owner/User accounts
- Role-based access control
- User profile management
- Password change functionality

### 💰 Payment Integration
- Razorpay payment gateway
- Transaction history
- Revenue analytics
- Machine-wise revenue tracking

### 📊 Analytics & Reporting
- Revenue analytics with charts
- Transaction logs
- Machine status tracking
- Usage statistics

### 🔧 Additional Features
- Dark/Light mode support
- Responsive design (mobile-friendly)
- CSRF protection
- Session management
- Real-time updates

## Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **Sequelize** - ORM for database
- **MySQL/SQLite** - Database
- **EJS** - Template engine

### Frontend
- **Alpine.js** - Lightweight JavaScript framework
- **Tailwind CSS** - Utility-first CSS framework
- **Chart.js** - Data visualization

### IoT/Firmware
- **ESP32** - Microcontroller
- **Arduino** - Firmware development

### Security
- **bcryptjs** - Password hashing
- **csurf** - CSRF protection
- **express-session** - Session management
- **helmet** - Security headers

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MySQL database (for production)
- npm or yarn

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hostingertest
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and fill in your configuration:
   - Database credentials
   - Session secrets
   - Razorpay API keys
   - Public URL

4. **Initialize database**
   The database will be automatically synced on first run.

5. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## Default Credentials

After first run, create an admin account or use the seeded credentials if available.

## ESP32 Firmware

The ESP32 firmware is located in the `firmware/` directory.

### Flashing Firmware
1. Open `firmware/esp32_control_wrover.ino` in Arduino IDE
2. Configure WiFi credentials
3. Set server URL
4. Upload to ESP32

### Configuration
- Update WiFi SSID and password
- Set server IP/domain
- Configure GPIO pins as needed

## Project Structure

```
hostingertest/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Custom middleware
│   ├── models/          # Database models
│   ├── routes/          # Route definitions
│   ├── views/           # EJS templates
│   │   ├── admin/       # Admin views
│   │   ├── users/       # User views
│   │   ├── control/     # Machine control views
│   │   └── partials/    # Reusable components
│   ├── public/          # Static assets
│   └── server.js        # Application entry point
├── firmware/            # ESP32 firmware
├── scripts/             # Utility scripts
├── .env.example         # Environment template
├── package.json         # Dependencies
└── README.md            # This file
```

## API Endpoints

### Authentication
- `GET /login` - Login page
- `POST /login` - Login handler
- `GET /logout` - Logout handler

### Dashboard
- `GET /` - Main dashboard
- `GET /admin` - Admin dashboard
- `GET /users` - User dashboard

### Machine Control
- `GET /control/:machineId` - Machine control page
- `POST /control/:machineId/gpio` - GPIO control
- `POST /control/:machineId/sequence` - Sequence control

### Profile
- `GET /admin/profile` - Admin profile
- `POST /admin/profile/update` - Update profile
- `POST /admin/profile/password` - Change password
- `GET /users/profile` - User profile
- `POST /users/profile/update` - Update profile
- `POST /users/profile/password` - Change password

### Analytics
- `GET /analytics` - Analytics dashboard
- `GET /api/analytics/revenue` - Revenue data

### Webhooks
- `POST /webhook/esp32` - ESP32 status updates
- `POST /webhook/payment` - Payment notifications

## WebSocket Events

### Client → Server
- `gpio_control` - Control GPIO pins
- `sequence_control` - Control sequences
- `request_status` - Request machine status

### Server → Client
- `machine_update` - Machine status update
- `gpio_update` - GPIO state update
- `sequence_update` - Sequence status update

## Deployment

### 📘 Hostinger Deployment Guide
For detailed, step-by-step instructions on deploying this application to **Hostinger** (Node.js App) and configuring the ESP32, please refer to the dedicated guide:
👉 **[HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md)**

### Production Checklist
- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Use MySQL instead of SQLite
- [ ] Configure proper session secrets
- [ ] Set up SSL/HTTPS
- [ ] Configure firewall rules
- [ ] Set up process manager (PM2)
- [ ] Configure reverse proxy (Nginx)
- [ ] Set up automated backups
- [ ] Configure logging
- [ ] Test all features

### Using PM2
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/server.js --name zefender

# Save PM2 configuration
pm2 save

# Set up auto-restart on reboot
pm2 startup
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Environment Variables

See `.env.example` for all available configuration options.

## Security

- Passwords are hashed using bcrypt
- CSRF protection enabled
- Session-based authentication
- Helmet.js for security headers
- Input validation on all forms

## Troubleshooting

### Database Connection Issues
- Verify database credentials in `.env`
- Ensure MySQL server is running
- Check firewall rules

### ESP32 Connection Issues
- Verify WiFi credentials
- Check server URL configuration
- Ensure port 3000 is accessible
- Check firewall rules for WebSocket

### Payment Issues
- Verify Razorpay API keys
- Check webhook URL configuration
- Ensure PUBLIC_URL is set correctly

## License

[Your License Here]

## Support

For issues and questions, please contact [your contact information].

## Contributing

[Your contribution guidelines here]
