// File: server.js
const express = require('express');
const telegramModule = require('./telegram-module');
const messengerModule = require('./messenger-module');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== ROUTES ====================

// 1. Telegram bot routes
app.use('/telegram', telegramModule.router);

// 2. Messenger bot routes
app.use('/messenger', messengerModule.router);

// ... (giữ nguyên phần còn lại của server.js)

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
        await telegramModule.setupTelegramWebhook();
        console.log('✅ Telegram webhook setup completed');
    } catch (error) {
        console.error('❌ Telegram webhook setup failed:', error.message);
    }
});