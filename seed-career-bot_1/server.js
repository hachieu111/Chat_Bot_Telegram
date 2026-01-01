//file: server.js
const express = require('express');
const { router: telegramRouter, setupWebhook: setupTelegramWebhook } = require('./telegram-module');
const messengerApp = require('./messenger-module');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== ROUTES ====================

// 1. Telegram bot routes
app.use('/telegram', telegramRouter);

// 2. Messenger bot routes
app.use(messengerApp);  // Messenger routes đã được định nghĩa trong messenger-module.js

// 3. Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'SEED Career Bot - Multi-Platform',
        platforms: ['Telegram', 'Facebook Messenger'],
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        endpoints: {
            telegram: '/telegram/webhook',
            messenger: '/messenger/webhook',
            admin: '/admin?secret=YOUR_SECRET',
            health: '/health'
        }
    });
});

// 4. Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 5. Admin dashboard
app.get('/admin', (req, res) => {
    const secret = req.query.secret;
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).send(`
            <h1>Access Denied</h1>
            <p>Please provide correct secret key: ?secret=YOUR_SECRET</p>
        `);
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>SEED Bot Admin Dashboard</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 30px; }
                .platform-card { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .status-online { color: #10b981; font-weight: bold; }
                .status-offline { color: #ef4444; font-weight: bold; }
                .endpoint { background: #f8fafc; padding: 10px; border-radius: 4px; font-family: monospace; margin: 5px 0; }
                .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🤖 SEED Multi-Platform Bot Dashboard</h1>
                <p>Manage both Telegram and Messenger bots from one place</p>
            </div>
            
            <div class="grid">
                <div class="platform-card">
                    <h2>📱 Telegram Bot</h2>
                    <p>Status: <span class="status-online">🟢 Online</span></p>
                    <p><strong>Webhook Endpoint:</strong></p>
                    <div class="endpoint">/telegram/webhook</div>
                    <p><strong>Actions:</strong></p>
                    <a href="/telegram/webhook-info" style="display: inline-block; background: #3b82f6; color: white; padding: 8px 16px; border-radius: 4px; text-decoration: none; margin: 5px;">Webhook Info</a>
                    <a href="/api/stats?x-admin-token=${secret}" style="display: inline-block; background: #10b981; color: white; padding: 8px 16px; border-radius: 4px; text-decoration: none; margin: 5px;">View Stats</a>
                </div>
                
                <div class="platform-card">
                    <h2>💬 Messenger Bot</h2>
                    <p>Status: <span class="status-online">🟢 Online</span></p>
                    <p><strong>Webhook Endpoint:</strong></p>
                    <div class="endpoint">/messenger/webhook</div>
                    <p><strong>Actions:</strong></p>
                    <a href="https://developers.facebook.com/apps/" target="_blank" style="display: inline-block; background: #1877f2; color: white; padding: 8px 16px; border-radius: 4px; text-decoration: none; margin: 5px;">Facebook Developer</a>
                </div>
            </div>
            
            <div class="platform-card">
                <h2>📊 System Information</h2>
                <p><strong>Server Uptime:</strong> ${Math.floor(process.uptime() / 60)} minutes</p>
                <p><strong>Node.js Version:</strong> ${process.version}</p>
                <p><strong>Platform:</strong> ${process.platform}</p>
                <p><strong>Memory Usage:</strong> ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB</p>
            </div>
        </body>
        </html>
    `);
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({ 
        error: 'Route not found',
        available_routes: {
            home: '/',
            health: '/health',
            admin: '/admin?secret=YOUR_SECRET',
            telegram_webhook: '/telegram/webhook (POST only)',
            messenger_webhook: '/messenger/webhook (GET/POST)',
            telegram_webhook_info: '/telegram/webhook-info'
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.stack);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ==================== KHỞI ĐỘNG SERVER ====================

app.listen(PORT, '0.0.0.0', async () => {
    console.log('='.repeat(70));
    console.log(`🚀 SEED Multi-Platform Bot Server started on port ${PORT}`);
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log('='.repeat(70));
    console.log('📱 PLATFORMS:');
    console.log(`   • Telegram Bot:    http://localhost:${PORT}/telegram/webhook`);
    console.log(`   • Messenger Bot:   http://localhost:${PORT}/messenger/webhook`);
    console.log(`   • Health Check:    http://localhost:${PORT}/`);
    console.log(`   • Admin Dashboard: http://localhost:${PORT}/admin?secret=${process.env.ADMIN_SECRET || 'YOUR_SECRET'}`);
    console.log('='.repeat(70));
    
    // Setup Telegram webhook
    try {
        await setupTelegramWebhook();
        console.log('✅ Telegram webhook setup completed');
    } catch (error) {
        console.error('❌ Telegram webhook setup failed:', error.message);
    }
});