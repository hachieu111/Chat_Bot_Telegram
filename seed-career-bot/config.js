// File: config.js
require('dotenv').config();

// Validate environment variables
function validateEnv() {
    const errors = [];
    
    // Telegram token format: 1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
    const telegramToken = process.env.TELEGRAM_TOKEN;
    if (!telegramToken || telegramToken === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
        errors.push('TELEGRAM_TOKEN is not set or is using placeholder');
    } else if (!telegramToken.includes(':')) {
        errors.push('TELEGRAM_TOKEN format is invalid (should be "id:token")');
    }
    
    // DeepSeek API key format: sk-...
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (process.env.ENABLE_AI === 'true' && (!deepseekKey || deepseekKey === 'YOUR_DEEPSEEK_API_KEY_HERE')) {
        errors.push('DEEPSEEK_API_KEY is required when ENABLE_AI=true');
    }
    
    // Admin IDs (optional but recommended)
    const adminIds = process.env.ADMIN_IDS;
    if (adminIds && !adminIds.match(/^\d+(,\d+)*$/)) {
        errors.push('ADMIN_IDS should be comma-separated numbers (e.g., "123,456")');
    }
    
    if (errors.length > 0) {
        console.error('❌ Environment validation errors:');
        errors.forEach(error => console.error(`   - ${error}`));
        
        if (process.env.NODE_ENV === 'production') {
            console.error('Exiting due to configuration errors');
            process.exit(1);
        } else {
            console.warn('⚠️ Running in development mode despite errors');
        }
    }
}

// Run validation
validateEnv();

// Configuration object
const config = {
    // Telegram Bot
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
    ADMIN_IDS: process.env.ADMIN_IDS 
        ? process.env.ADMIN_IDS.split(',').map(id => id.trim()).filter(id => id)
        : [],
    
    // DeepSeek AI Configuration
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
    DEEPSEEK_MODEL: 'deepseek-chat',
    ENABLE_AI: process.env.ENABLE_AI === 'true',
    AI_MODE: process.env.AI_MODE || 'controlled',
    MAX_AI_REQUESTS_PER_USER: parseInt(process.env.MAX_AI_REQUESTS_PER_USER) || 10,
    AI_TEMPERATURE: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    AI_MAX_TOKENS: parseInt(process.env.AI_MAX_TOKENS) || 150,
    
    // Server Configuration
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
    
    // Security
    ADMIN_SECRET: process.env.ADMIN_SECRET || 'default-admin-secret-change-in-production',
    
    // Application Settings
    BOT_NAME: 'SEED Career Coach',
    VERSION: '1.0.0',
    AUTO_SAVE_INTERVAL: parseInt(process.env.AUTO_SAVE_INTERVAL) || 30000, // 30 seconds
    MAX_ATTEMPTS_PER_QUESTION: parseInt(process.env.MAX_ATTEMPTS_PER_QUESTION) || 3,
    MAX_CONCURRENT_JOBS: parseInt(process.env.MAX_CONCURRENT_JOBS) || 5,
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    ENABLE_REQUEST_LOGGING: process.env.ENABLE_REQUEST_LOGGING !== 'false',
    
    // Rate Limiting
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 minute
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100, // requests per window
    
    // Database
    DB_AUTO_SAVE: process.env.DB_AUTO_SAVE !== 'false',
    DB_BACKUP_INTERVAL: parseInt(process.env.DB_BACKUP_INTERVAL) || 3600000, // 1 hour
};

// Log configuration (safely, without sensitive data)
if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Configuration loaded:');
    console.log(`   Environment: ${config.NODE_ENV}`);
    console.log(`   AI Enabled: ${config.ENABLE_AI}`);
    console.log(`   AI Mode: ${config.AI_MODE}`);
    console.log(`   Admin Count: ${config.ADMIN_IDS.length}`);
    console.log(`   Max AI Requests/User: ${config.MAX_AI_REQUESTS_PER_USER}`);
} else {
    console.log('✅ Production configuration loaded');
}

module.exports = config;