// File: config-messenger.js
require('dotenv').config();

module.exports = {
  // Facebook Messenger
  FACEBOOK_PAGE_TOKEN: process.env.FACEBOOK_PAGE_TOKEN,
  FACEBOOK_VERIFY_TOKEN: process.env.FACEBOOK_VERIFY_TOKEN || 'seed-career-verify',
  FACEBOOK_API_URL: 'https://graph.facebook.com/v18.0',
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
  
  // DeepSeek AI
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
  ENABLE_AI: process.env.ENABLE_AI === 'true',
  AI_MODE: process.env.AI_MODE || 'controlled',
  
  // App settings
  APP_NAME: 'SEED Career Skills',
  BOT_NAME: 'SEED Career Coach',
  MAX_ATTEMPTS_PER_QUESTION: 3,
  MAX_AI_REQUESTS_PER_USER: parseInt(process.env.MAX_AI_REQUESTS_PER_USER) || 5,
  AUTO_SAVE_INTERVAL: 30000,
  
  // Server
  PORT: process.env.PORT || 3000,
  WEBHOOK_PATH: '/webhook',
  NODE_ENV: process.env.NODE_ENV || 'development'
};