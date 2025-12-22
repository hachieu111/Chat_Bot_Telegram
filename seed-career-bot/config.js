require('dotenv').config();

module.exports = {
  // Telegram
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  ADMIN_IDS: process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())),
  
  // DeepSeek AI
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
  ENABLE_AI: process.env.ENABLE_AI === 'true',
  AI_MODE: process.env.AI_MODE || 'controlled', // 'controlled' | 'free' | 'off'
  
  // App settings
  BOT_NAME: 'SEED Career Coach',
  AUTO_SAVE_INTERVAL: 30000, // 30 giây
  MAX_ATTEMPTS_PER_QUESTION: 3,
  MAX_AI_REQUESTS_PER_USER: 5
};
