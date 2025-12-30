const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIG CHUNG ====================
const config = {
  // Telegram
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  TELEGRAM_WEBHOOK: process.env.RENDER_EXTERNAL_URL 
    ? `${process.env.RENDER_EXTERNAL_URL}/telegram-webhook`
    : null,
  
  // Messenger
  FACEBOOK_PAGE_TOKEN: process.env.FACEBOOK_PAGE_TOKEN,
  FACEBOOK_VERIFY_TOKEN: process.env.FACEBOOK_VERIFY_TOKEN || 'seed-career-verify-2024',
  FACEBOOK_API_URL: 'https://graph.facebook.com/v18.0',
  
  // Shared
  ENABLE_AI: process.env.ENABLE_AI === 'true',
  AI_MODE: process.env.AI_MODE || 'controlled',
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [],
  
  // Skills data sẽ dùng chung
  skills: require('./skills.json').skills
};

// ==================== KHỞI TẠO BOT TELEGRAM ====================
let telegramBot = null;
if (config.TELEGRAM_TOKEN && !config.TELEGRAM_TOKEN.includes('YOUR_TOKEN')) {
  telegramBot = new TelegramBot(config.TELEGRAM_TOKEN, {
    polling: false,
    onlyFirstMatch: true
  });
  console.log('🤖 Telegram Bot: Đã khởi tạo');
} else {
  console.log('⚠️ Telegram Bot: Chưa cấu hình token');
}

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== WEBHOOK TELEGRAM ====================
if (telegramBot) {
  // Webhook endpoint cho Telegram
  app.post('/telegram-webhook', (req, res) => {
    telegramBot.processUpdate(req.body);
    res.sendStatus(200);
  });

  // Lệnh /start Telegram
  telegramBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    telegramBot.sendMessage(chatId, '👋 Chào mừng đến với SEED Career Bot (Telegram)!');
  });

  // Lệnh /menu Telegram
  telegramBot.onText(/\/menu/, (msg) => {
    const chatId = msg.chat.id;
    const skillsText = config.skills.map(skill => 
      `• ${skill.icon} ${skill.name}`
    ).join('\n');
    
    telegramBot.sendMessage(chatId, 
      `📚 *DANH SÁCH KỸ NĂNG*\n\n${skillsText}\n\nChọn /skill_[id] để học`,
      { parse_mode: 'Markdown' }
    );
  });

  // Xử lý lệnh /skill
  telegramBot.onText(/\/skill_(.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const skillId = match[1];
    const skill = config.skills.find(s => s.id === skillId);
    
    if (skill) {
      telegramBot.sendMessage(chatId,
        `📘 *${skill.name}*\n\n${skill.description}\n\n` +
        `Độ khó: ${skill.difficulty}\n` +
        `Thời lượng: ${skill.duration}`,
        { parse_mode: 'Markdown' }
      );
    }
  });
}

// ==================== WEBHOOK MESSENGER ====================
// Verify webhook Facebook
app.get('/messenger-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔍 Facebook webhook verification:');
  console.log('Mode:', mode);
  console.log('Token:', token);
  console.log('Expected:', config.FACEBOOK_VERIFY_TOKEN);

  if (mode === 'subscribe' && token === config.FACEBOOK_VERIFY_TOKEN) {
    console.log('✅ Facebook webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Facebook verification failed');
    res.sendStatus(403);
  }
});

// Receive webhook Facebook
app.post('/messenger-webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry) {
        const webhookEvent = entry.messaging[0];
        
        if (webhookEvent.message) {
          await handleMessengerMessage(webhookEvent);
        } else if (webhookEvent.postback) {
          await handleMessengerPostback(webhookEvent);
        }
      }
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('❌ Lỗi xử lý Facebook webhook:', error);
    res.sendStatus(500);
  }
});

// Hàm xử lý tin nhắn Messenger
async function handleMessengerMessage(event) {
  const senderId = event.sender.id;
  const messageText = event.message?.text;

  if (!messageText) return;

  console.log(`📨 Messenger từ ${senderId}: ${messageText}`);

  // Logic xử lý Messenger
  let responseText = '';
  
  if (messageText.toLowerCase().includes('hello') || 
      messageText.toLowerCase().includes('chào') ||
      messageText.toLowerCase().includes('hi')) {
    responseText = '👋 Chào bạn! Tôi là SEED Career Bot trên Messenger!';
  } else if (messageText.toLowerCase().includes('kỹ năng') || 
             messageText.toLowerCase().includes('skill')) {
    responseText = '📚 *DANH SÁCH KỸ NĂNG*\n\n' + 
      config.skills.map(skill => 
        `${skill.icon} ${skill.name}`
      ).join('\n');
  } else if (messageText.toLowerCase().includes('menu')) {
    responseText = '📋 *MENU CHÍNH*\n\n' +
      '1. 📚 Học kỹ năng\n' +
      '2. 📈 Xem tiến độ\n' +
      '3. 🏆 Thành tích\n' +
      '4. ❓ Trợ giúp';
  } else {
    responseText = `🤖 Messenger Bot: Bạn nói "${messageText}"`;
  }

  // Gửi phản hồi
  await sendMessengerMessage(senderId, responseText);
}

// Hàm xử lý postback Messenger
async function handleMessengerPostback(event) {
  const senderId = event.sender.id;
  const payload = event.postback.payload;

  console.log(`🔄 Messenger postback từ ${senderId}: ${payload}`);

  let responseText = '';
  
  switch(payload) {
    case 'GET_STARTED':
      responseText = '🎉 Chào mừng đến với SEED Career Bot (Messenger)!';
      break;
    case 'LEARN_NEW':
      responseText = '📚 *DANH SÁCH KỸ NĂNG*\n\n' + 
        config.skills.map(skill => 
          `${skill.icon} ${skill.name}`
        ).join('\n');
      break;
    case 'VIEW_PROGRESS':
      responseText = '📈 Tính năng xem tiến độ đang được phát triển...';
      break;
    case 'ACHIEVEMENTS':
      responseText = '🏆 Tính năng thành tích đang được phát triển...';
      break;
    default:
      responseText = `Đã nhận postback: ${payload}`;
  }

  await sendMessengerMessage(senderId, responseText);
}

// Hàm gửi tin nhắn Messenger
async function sendMessengerMessage(recipientId, messageText) {
  try {
    const response = await axios.post(
      `${config.FACEBOOK_API_URL}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: messageText }
      },
      {
        params: { access_token: config.FACEBOOK_PAGE_TOKEN },
        headers: { 'Content-Type': 'application/json' }
      }
    );
    console.log(`✅ Đã gửi Messenger đến ${recipientId}`);
    return response.data;
  } catch (error) {
    console.error('❌ Lỗi gửi Messenger:', error.response?.data?.error || error.message);
    return null;
  }
}

// ==================== ROUTES CHUNG ====================
// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'SEED Career Bot - Combined Server',
    bots: {
      telegram: !!telegramBot,
      messenger: !!config.FACEBOOK_PAGE_TOKEN
    },
    endpoints: {
      telegram_webhook: '/telegram-webhook',
      messenger_webhook: '/messenger-webhook',
      health: '/health'
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString() 
  });
});

// Admin dashboard
app.get('/admin', (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).send('Access Denied');
  }
  
  res.send(`
    <h1>🤖 SEED Bot Admin</h1>
    <p>Total Skills: ${config.skills.length}</p>
    <p>Telegram: ${telegramBot ? '✅ Active' : '❌ Inactive'}</p>
    <p>Messenger: ${config.FACEBOOK_PAGE_TOKEN ? '✅ Active' : '❌ Inactive'}</p>
  `);
});

// ==================== KHỞI ĐỘNG SERVER ====================
async function setupWebhooks() {
  console.log('🔧 Đang thiết lập webhooks...');
  
  // Setup Telegram webhook nếu có URL
  if (telegramBot && config.TELEGRAM_WEBHOOK) {
    try {
      await telegramBot.deleteWebHook();
      await telegramBot.setWebHook(config.TELEGRAM_WEBHOOK);
      console.log(`✅ Telegram webhook: ${config.TELEGRAM_WEBHOOK}`);
    } catch (error) {
      console.error('❌ Lỗi thiết lập Telegram webhook:', error.message);
    }
  }
  
  // Thông tin Messenger webhook
  if (config.FACEBOOK_PAGE_TOKEN) {
    const webhookUrl = process.env.RENDER_EXTERNAL_URL 
      ? `${process.env.RENDER_EXTERNAL_URL}/messenger-webhook`
      : 'https://YOUR_NGROK_URL/messenger-webhook';
    
    console.log(`✅ Messenger webhook cần cấu hình thủ công:`);
    console.log(`   URL: ${webhookUrl}`);
    console.log(`   Verify Token: ${config.FACEBOOK_VERIFY_TOKEN}`);
  }
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SEED Career Bot - Combined Server');
  console.log('='.repeat(60));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Telegram: ${telegramBot ? 'Active' : 'Inactive'}`);
  console.log(`📱 Messenger: ${config.FACEBOOK_PAGE_TOKEN ? 'Active' : 'Inactive'}`);
  console.log(`🤖 Skills: ${config.skills.length} kỹ năng`);
  
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`\n🌍 External URL: ${process.env.RENDER_EXTERNAL_URL}`);
    console.log(`📡 Telegram Webhook: ${process.env.RENDER_EXTERNAL_URL}/telegram-webhook`);
    console.log(`📱 Messenger Webhook: ${process.env.RENDER_EXTERNAL_URL}/messenger-webhook`);
  }
  
  console.log('\n👉 Cấu hình Facebook Messenger:');
  console.log(`   Webhook URL: ${process.env.RENDER_EXTERNAL_URL}/messenger-webhook`);
  console.log(`   Verify Token: ${config.FACEBOOK_VERIFY_TOKEN}`);
  console.log('='.repeat(60));
  
  await setupWebhooks();
});