const axios = require('axios');
require('dotenv').config();

const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_TOKEN;
const FACEBOOK_API_URL = 'https://graph.facebook.com/v18.0';

async function setupMessengerProfile() {
  console.log('🔧 Đang cài đặt Messenger Profile...');

  // 1. Get Started Button
  try {
    await axios.post(
      `${FACEBOOK_API_URL}/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        get_started: {
          payload: 'GET_STARTED'
        }
      }
    );
    console.log('✅ Get Started button đã cài đặt');
  } catch (error) {
    console.error('❌ Lỗi Get Started:', error.response?.data?.error || error.message);
  }

  // 2. Persistent Menu
  try {
    await axios.post(
      `${FACEBOOK_API_URL}/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      {
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
      }
    );
    console.log('✅ Persistent menu đã cài đặt');
  } catch (error) {
    console.error('❌ Lỗi Persistent menu:', error.response?.data?.error || error.message);
  }

  console.log('🎉 Cài đặt Messenger hoàn tất!');
}

if (require.main === module) {
  setupMessengerProfile();
}

module.exports = { setupMessengerProfile };