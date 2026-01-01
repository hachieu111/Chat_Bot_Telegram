// File: setup-messenger.js
const axios = require('axios');
require('dotenv').config();

const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_TOKEN;
const FACEBOOK_API_URL = 'https://graph.facebook.com/v18.0';

async function setupGetStartedButton() {
  const config = {
    get_started: {
      payload: 'GET_STARTED'
    }
  };

  try {
    const response = await axios.post(
      `${FACEBOOK_API_URL}/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      config
    );
    console.log('✅ Get Started button đã được cài đặt');
    return response.data;
  } catch (error) {
    console.error('❌ Lỗi cài đặt Get Started button:', error.response?.data?.error || error.message);
    throw error;
  }
}

async function setupPersistentMenu() {
  const menuConfig = {
    persistent_menu: [
      {
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: [
          {
            type: 'postback',
            title: '📚 Học kỹ năng',
            payload: 'LEARN_NEW'
          },
          {
            type: 'postback',
            title: '📈 Xem tiến độ',
            payload: 'VIEW_PROGRESS'
          },
          {
            type: 'postback',
            title: '🏆 Thành tích',
            payload: 'ACHIEVEMENTS'
          },
          {
            type: 'web_url',
            title: '🌐 Website SEED',
            url: 'https://seedvn.org',
            webview_height_ratio: 'full'
          }
        ]
      }
    ]
  };

  try {
    const response = await axios.post(
      `${FACEBOOK_API_URL}/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      menuConfig
    );
    console.log('✅ Persistent menu đã được cài đặt');
    return response.data;
  } catch (error) {
    console.error('❌ Lỗi cài đặt Persistent menu:', error.response?.data?.error || error.message);
    throw error;
  }
}

async function setupWhitelistedDomains() {
  const domainConfig = {
    whitelisted_domains: [
      'https://seedvn.org',
      'https://your-app.onrender.com'
    ]
  };

  try {
    const response = await axios.post(
      `${FACEBOOK_API_URL}/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      domainConfig
    );
    console.log('✅ Whitelisted domains đã được cài đặt');
    return response.data;
  } catch (error) {
    console.error('❌ Lỗi cài đặt Whitelisted domains:', error.response?.data?.error || error.message);
    throw error;
  }
}

async function setupAll() {
  if (!PAGE_ACCESS_TOKEN) {
    console.error('❌ PAGE_ACCESS_TOKEN chưa được cấu hình trong .env');
    process.exit(1);
  }

  console.log('🚀 Bắt đầu cài đặt Messenger Profile...');
  
  try {
    await setupGetStartedButton();
    await setupPersistentMenu();
    await setupWhitelistedDomains();
    
    console.log('🎉 Cài đặt thành công! Bot đã sẵn sàng.');
    console.log('📱 Test bot tại: m.me/your-page-username');
  } catch (error) {
    console.error('❌ Có lỗi trong quá trình cài đặt');
    process.exit(1);
  }
}

// Chạy setup nếu file được gọi trực tiếp
if (require.main === module) {
  setupAll();
}

module.exports = {
  setupGetStartedButton,
  setupPersistentMenu,
  setupWhitelistedDomains,
  setupAll
};