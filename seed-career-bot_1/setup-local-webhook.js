
// setup-webhook-now.js
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

async function setupNow() {
    const token = process.env.TELEGRAM_TOKEN;
    if (!token) {
        console.error('❌ TELEGRAM_TOKEN not found! Check .env file');
        return;
    }

    const bot = new TelegramBot(token);
    
    // THAY URL_NGROK_CUA_BAN bằng URL từ ngrok
    const ngrokUrl = 'https://unrationalised-interjacent-lovella.ngrok-free.dev'; // VÍ DỤ: https://abc-123-xxx.ngrok-free.app
    
    console.log('🔧 SETTING UP WEBHOOK...');
    console.log(`🤖 Bot Token: ${token.substring(0, 10)}...`);
    console.log(`🌐 Ngrok URL: ${ngrokUrl}`);
    
    try {
        // 1. Kiểm tra webhook hiện tại
        console.log('\n📊 Checking current webhook...');
        const current = await bot.getWebHookInfo();
        console.log('- Current URL:', current.url || 'None');
        console.log('- Pending updates:', current.pending_update_count);
        
        // 2. Xóa webhook cũ (nếu có)
        console.log('\n🗑️  Deleting old webhook...');
        await bot.deleteWebHook();
        console.log('✅ Old webhook deleted');
        
        // 3. Set webhook mới
        console.log(`\n📡 Setting new webhook to: ${ngrokUrl}/webhook`);
        await bot.setWebHook(`${ngrokUrl}/webhook`, {
            max_connections: 40,
            allowed_updates: ['message', 'callback_query', 'chat_member']
        });
        
        console.log('✅ WEBHOOK SETUP SUCCESSFUL!');
        
        // 4. Xác nhận
        const info = await bot.getWebHookInfo();
        console.log('\n📋 CONFIRMATION:');
        console.log('✅ URL:', info.url ? 'SET' : 'NOT SET');
        console.log('✅ Has custom cert:', info.has_custom_certificate ? 'Yes' : 'No');
        console.log('✅ Pending updates:', info.pending_update_count);
        console.log('✅ Max connections:', info.max_connections);
        
        console.log('\n🎉 BOT READY! Send /start to your bot on Telegram');
        
    } catch (error) {
        console.error('\n❌ WEBHOOK SETUP FAILED:', error.message);
        console.log('\n💡 TROUBLESHOOTING:');
        console.log('1. Make sure bot.js is running on port 3000');
        console.log('2. Check if port 3000 is accessible');
        console.log('3. Verify TELEGRAM_TOKEN in .env file');
    }
}

setupNow();