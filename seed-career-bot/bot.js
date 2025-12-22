// File: bot.js
const TelegramBot = require('node-telegram-bot-api');

const express = require('express');

const config = require('./config');
const database = require('./database');
const skillsData = require('./skills.json');
const deepseek = require('./deepseek');
const aiController = require('./ai-controller');

// 1. Khởi tạo Express
const app = express();
const PORT = process.env.PORT || 3000;

// 2. Lấy token từ biến môi trường
const token = process.env.TELEGRAM_TOKEN;

// 3. Kiểm tra token (QUAN TRỌNG)
if (!token) {
    console.error('❌ ERROR: TELEGRAM_TOKEN is not set!');
    process.exit(1); // Thoát nếu không có token
}



// Khởi tạo bot
const bot = new TelegramBot(config.TELEGRAM_TOKEN, { 
  polling: true,
  requestTimeout: 60000
});


console.log('🚀 Bot đang khởi động...');

// 5. Middleware để parse JSON
app.use(express.json());

// 6. Webhook endpoint
app.post(`/bot${token}`, (req, res) => {
    console.log('📩 Received update from Telegram');
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// 7. Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'SEED Career Coach Bot',
        uptime: process.uptime()
    });
});

// 8. Khởi động server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Bot is ready`);
    
    // 9. Thiết lập webhook (chỉ khi có domain)
    const webhookUrl = process.env.RENDER_EXTERNAL_URL 
        ? `${process.env.RENDER_EXTERNAL_URL}/bot${token}`
        : null;
    
    if (webhookUrl) {
        bot.setWebHook(webhookUrl)
            .then(() => console.log(`🌐 Webhook set to: ${webhookUrl}`))
            .catch(err => console.error('❌ Webhook error:', err.message));
    } else {
        console.log('⚠️ Running in local mode (no webhook)');
    }
});

const skills = skillsData.skills;

// ==================== HÀM TIỆN ÍCH ====================
function sendMenu(chatId, userId) {
  const user = database.getUser(userId);
  const completed = user.completedSkills?.length || 0;
  const total = skills.length;
  const progress = Math.round((completed / total) * 100);

  const menuText = `👋 *Chào ${user.name || 'bạn'}!*\n\n` +
    `📊 Tiến độ: ${progress}% (${completed}/${total} kỹ năng)\n\n` +
    `Chọn chức năng:`;

  const buttons = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📚 Học kỹ năng mới", callback_data: "learn_new" },
          { text: "▶️ Tiếp tục học", callback_data: "continue_learning" }
        ],
        [
          { text: "📈 Xem tiến độ", callback_data: "view_progress" },
          { text: "🏆 Thành tích", callback_data: "achievements" }
        ],
        [
          { text: "❓ Trợ giúp", callback_data: "help" },
          { text: "ℹ️ Giới thiệu", callback_data: "about" }
        ]
      ]
    },
    parse_mode: 'Markdown'
  };

  bot.sendMessage(chatId, menuText, buttons);
}

function sendSkillMenu(chatId, userId) {
  const user = database.getUser(userId);
  const completed = user.completedSkills || [];

  let rows = [];
  skills.forEach(skill => {
    const isCompleted = completed.includes(skill.id);
    rows.push([{
      text: `${isCompleted ? '✅' : '📘'} ${skill.icon} ${skill.name}`,
      callback_data: `view_skill_${skill.id}`
    }]);
  });

  rows.push([{ text: "🔙 Quay lại", callback_data: "main_menu" }]);

  bot.sendMessage(chatId, "📚 *DANH SÁCH KỸ NĂNG*\n\nChọn kỹ năng bạn muốn học:", {
    reply_markup: { inline_keyboard: rows },
    parse_mode: 'Markdown'
  });
}

function startSkill(chatId, userId, skillId) {
  const skill = skills.find(s => s.id === skillId);
  if (!skill) return;

  database.updateUser(userId, {
    currentSkill: skillId,
    currentStep: 0
  });

  sendSkillStep(chatId, userId, skill, 0);
}

function sendSkillStep(chatId, userId, skill, stepIndex) {
  const user = database.getUser(userId);
  
  // Kiểm tra nếu stepIndex vượt quá số step
  if (stepIndex >= skill.steps.length) {
    // Hoàn thành bài học
    database.completeSkill(userId, skill.id);
    
    bot.sendMessage(chatId, 
      `🎉 *CHÚC MỪNG!*\n\nBạn đã hoàn thành:\n*${skill.name}*\n\nTiếp tục học nhé!`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "📚 Học tiếp", callback_data: "learn_new" }],
          [{ text: "🏠 Về menu", callback_data: "main_menu" }]
        ]
      }
    });
    return;
  }

  const step = skill.steps[stepIndex];

  if (!step) {
    console.error(`❌ Không tìm thấy step ${stepIndex} trong skill ${skill.id}`);
    return;
  }

  let messageText = step.content;
  let buttons = [];

  switch (step.type) {
    case 'scenario':
      if (step.options) {
        step.options.forEach(opt => {
          buttons.push([{
            text: `${opt.id}. ${opt.text}`,
            callback_data: `answer_${skill.id}_${stepIndex}_${opt.id}`
          }]);
        });
        
        // Thêm nút "Tự gõ câu trả lời" nếu có AI
        if (step.ai_controlled && config.ENABLE_AI) {
          buttons.push([{
            text: "💬 Tự gõ câu trả lời (AI hỗ trợ)",
            callback_data: `free_response_${skill.id}_${stepIndex}`
          }]);
        }
      }
      break;

    default:
      if (step.buttons) {
        step.buttons.forEach(btn => {
          buttons.push([{
            text: btn.text,
            callback_data: btn.callback
          }]);
        });
      } else {
        // Thêm nút tiếp tục mặc định nếu không có nút nào
        const nextStep = stepIndex + 1;
        if (nextStep < skill.steps.length) {
          buttons.push([{
            text: "Tiếp tục →",
            callback_data: `skill_${skill.id}_step_${nextStep}`
          }]);
        } else {
          buttons.push([{
            text: "✅ Hoàn thành",
            callback_data: `complete_skill_${skill.id}`
          }]);
        }
      }
  }

  // Thêm nút điều hướng (Lùi lại chỉ hiện nếu không phải step đầu)
  if (stepIndex > 0) {
    buttons.push([
      { text: "🔙 Lùi lại", callback_data: `skill_${skill.id}_step_${stepIndex - 1}` },
      { text: "🏠 Menu", callback_data: "main_menu" }
    ]);
  } else {
    buttons.push([
      { text: "🏠 Menu", callback_data: "main_menu" }
    ]);
  }

  bot.sendMessage(chatId, messageText, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });

  // Cập nhật step hiện tại
  database.updateUser(userId, { currentStep: stepIndex });
}

// ==================== XỬ LÝ LỆNH ====================

// Lệnh /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || '';

  console.log(`👤 Người dùng mới: ${userId} - ${firstName}`);

  const welcomeText = `👋 *Chào mừng đến với SEED Career Coach!*\n\n` +
    `Tôi sẽ đồng hành cùng bạn học *${skills.length} kỹ năng xã hội* quan trọng cho công việc.\n\n` +
    `🎯 *Bạn sẽ học được:*\n` +
    `• Kỹ năng giao tiếp cơ bản\n` +
    `• Cách ứng xử chuyên nghiệp\n` +
    `• Kỹ năng làm việc nhóm\n` +
    `• Xử lý tình huống phức tạp\n\n` +
    `💡 *Bắt đầu bằng cách:*\n` +
    `1. Chọn kỹ năng từ menu\n` +
    `2. Học lý thuyết ngắn gọn\n` +
    `3. Thực hành với tình huống thực tế\n` +
    `4. Nhận phản hồi và tiến bộ`;

  bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });

  // Hỏi tên nếu chưa có
  setTimeout(() => {
    const user = database.getUser(userId);
    if (!user.name) {
      bot.sendMessage(chatId, "Đầu tiên, cho mình biết tên của bạn nhé!\n\nGửi tên của bạn vào chat này:", {
        reply_markup: {
          force_reply: true,
          selective: true
        }
      });
    } else {
      sendMenu(chatId, userId);
    }
  }, 1500);
});

// Xử lý khi user gửi tên
bot.on('message', (msg) => {
  if (msg.reply_to_message && msg.reply_to_message.text && 
      msg.reply_to_message.text.includes("cho mình biết tên")) {
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const name = msg.text.trim();

    database.updateUser(userId, { name });
    
    bot.sendMessage(chatId, `✅ Đã lưu tên: *${name}*\n\nRất vui được đồng hành cùng bạn!`, {
      parse_mode: 'Markdown'
    });
    
    setTimeout(() => sendMenu(chatId, userId), 1000);
  }
});

// Xử lý tin nhắn text thông thường (cho AI phân tích)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.trim();

  if (!text || text.startsWith('/')) return;

  const user = database.getUser(userId);
  
  // Nếu user đang trong chế độ free response của bài học
  if (user.currentSkill && user.aiMode === 'free_response') {
    
    // Kiểm tra số lần dùng AI
    const aiCount = database.incrementAIUsage(userId);
    if (aiCount > config.MAX_AI_REQUESTS_PER_USER) {
      bot.sendMessage(chatId, 
        `⚠️ Bạn đã dùng hết lượt phân tích AI hôm nay.\n` +
        `Hãy chọn đáp án có sẵn hoặc thử lại ngày mai nhé!`);
      return;
    }

    const skill = skills.find(s => s.id === user.currentSkill);
    const step = skill?.steps[user.currentStep];

    if (!step || !step.ai_controlled) return;

    // Hiển thị "đang phân tích"
    const analyzingMsg = await bot.sendMessage(chatId, "🤖 AI đang phân tích câu trả lời của bạn...");

    try {
      // Kiểm tra với AI Controller trước
      const validation = aiController.validateUserResponse(user.currentSkill, text);
      
      let aiResponse;
      if (!validation.isValid && config.AI_MODE === 'controlled') {
        // Dùng template thay vì gọi AI
        aiResponse = {
          content: `💡 *Gợi ý:*\n\n` +
                   `Câu trả lời ${validation.errors.includes('quá_ngắn') ? 'hơi ngắn' : 'có thể cải thiện'}.\n` +
                   `**Thử nói:** ${validation.suggestedTemplate || step.correct_answer_text}`,
          tokens: 0
        };
      } else {
        // Gọi DeepSeek AI
        const context = {
          skillName: skill.name,
          scenario: step.content,
          correctTemplate: step.correct_answer_text || ""
        };
        
        aiResponse = await deepseek.analyzeResponse(user.currentSkill, text, context);
      }

      // Xóa message "đang phân tích"
      await bot.deleteMessage(chatId, analyzingMsg.message_id);

      // Gửi phản hồi
      const responseText = `💡 *PHÂN TÍCH AI:*\n\n${aiResponse.content}\n\n` +
                          `📝 *Câu mẫu tốt:*\n"${step.correct_answer_text}"`;

      const buttons = [
        [{ text: "🔄 Thử lại với câu khác", callback_data: `retry_${skill.id}_${user.currentStep}` }],
        [{ text: "➡️ Tiếp tục bài học", callback_data: `skill_${skill.id}_step_${user.currentStep + 1}` }]
      ];

      bot.sendMessage(chatId, responseText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });

      // Tắt chế độ free response
      database.updateUser(userId, { aiMode: null });

    } catch (error) {
      console.error('❌ Lỗi phân tích AI:', error);
      await bot.deleteMessage(chatId, analyzingMsg.message_id);
      
      bot.sendMessage(chatId, 
        "❌ Có lỗi khi phân tích. Hãy thử chọn đáp án có sẵn nhé!\n\n" +
        `Câu trả lời mẫu: **${step.correct_answer_text}**`,
        { parse_mode: 'Markdown' }
      );
    }
  }
});

// Xử lý callback queries (khi bấm nút) - ĐÃ THÊM XỬ LÝ ĐẦY ĐỦ
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  console.log(`🔘 Callback: ${data} từ user ${userId}`);

  // Xóa "đang gõ..." trên Telegram
  await bot.answerCallbackQuery(callbackQuery.id);

  // Xử lý các callback - THÊM TẤT CẢ CÁC CALLBACK
  if (data === 'main_menu') {
    sendMenu(chatId, userId);
  }
  else if (data === 'learn_new') {
    sendSkillMenu(chatId, userId);
  }
  else if (data === 'continue_learning') {
    // Tiếp tục học: Tìm skill cuối cùng đang học hoặc chưa hoàn thành
    const user = database.getUser(userId);
    let skillToContinue = null;
    
    // Nếu có skill đang học dở
    if (user.currentSkill) {
      skillToContinue = skills.find(s => s.id === user.currentSkill);
    }
    
    // Nếu không, tìm skill đầu tiên chưa học
    if (!skillToContinue) {
      const completed = user.completedSkills || [];
      skillToContinue = skills.find(skill => !completed.includes(skill.id));
    }
    
    if (skillToContinue) {
      // Nếu có skill đang học, tiếp tục từ step hiện tại
      const startStep = user.currentSkill === skillToContinue.id ? user.currentStep : 0;
      sendSkillStep(chatId, userId, skillToContinue, startStep);
    } else {
      // Nếu tất cả đã hoàn thành
      bot.sendMessage(chatId, 
        `🎉 *XIN CHÚC MỪNG!*\n\nBạn đã hoàn thành tất cả kỹ năng!\n\nChờ các bài học mới nhé!`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: "🏠 Menu chính", callback_data: "main_menu" }]]
        }
      });
    }
  }
  else if (data === 'achievements') {
    // Hiển thị thành tích
    const user = database.getUser(userId);
    const completed = user.completedSkills?.length || 0;
    const total = skills.length;
    
    let achievementsText = `🏆 *THÀNH TÍCH CỦA BẠN*\n\n`;
    achievementsText += `✅ Đã hoàn thành: ${completed}/${total} kỹ năng\n\n`;
    
    if (completed > 0) {
      // Tính điểm trung bình
      let totalScore = 0;
      let count = 0;
      Object.keys(user.scores || {}).forEach(skillId => {
        totalScore += user.scores[skillId];
        count++;
      });
      const avgScore = count > 0 ? Math.round(totalScore / count) : 0;
      
      achievementsText += `📊 Điểm trung bình: ${avgScore}/100\n`;
      achievementsText += `🤖 Số lần dùng AI: ${user.aiUsageCount || 0}\n\n`;
      
      // Danh hiệu
      if (completed >= total) {
        achievementsText += `👑 *DANH HIỆU: BẬC THẦY GIAO TIẾP*\n`;
      } else if (completed >= total * 0.7) {
        achievementsText += `⭐ *DANH HIỆU: CHUYÊN GIA*\n`;
      } else if (completed >= total * 0.4) {
        achievementsText += `👍 *DANH HIỆU: NGƯỜI HỌC TÍCH CỰC*\n`;
      } else {
        achievementsText += `🌱 *DANH HIỆU: NGƯỜI MỚI BẮT ĐẦU*\n`;
      }
    } else {
      achievementsText += `📝 Bạn chưa có thành tích nào. Hãy bắt đầu học ngay nhé!\n`;
    }
    
    bot.sendMessage(chatId, achievementsText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "📚 Học ngay", callback_data: "learn_new" }],
          [{ text: "🏠 Menu chính", callback_data: "main_menu" }]
        ]
      }
    });
  }
  else if (data === 'about') {
    // Giới thiệu về bot
    const aboutText = `ℹ️ *GIỚI THIỆU VỀ SEED CAREER COACH*\n\n` +
                     `🤖 *Tên bot:* SEED Career Coach\n` +
                     `🎯 *Mục tiêu:* Hỗ trợ người tự kỷ phát triển kỹ năng xã hội\n` +
                     `📚 *Số kỹ năng:* ${skills.length} kỹ năng\n` +
                     `👥 *Đối tượng:* Người tự kỷ, người khó khăn trong giao tiếp\n\n` +
                     `💡 *Tính năng chính:*\n` +
                     `• Học kỹ năng giao tiếp cơ bản\n` +
                     `• Thực hành tình huống thực tế\n` +
                     `• Phản hồi từ AI thông minh\n` +
                     `• Theo dõi tiến độ học tập\n\n` +
                     `✨ *Phát triển bởi:* Đội ngũ SEED với sự hỗ trợ từ cộng đồng`;
    
    bot.sendMessage(chatId, aboutText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 Menu chính", callback_data: "main_menu" }]]
      }
    });
  }
  else if (data.startsWith('view_skill_')) {
    const skillId = data.replace('view_skill_', '');
    const skill = skills.find(s => s.id === skillId);
    
    if (skill) {
      const user = database.getUser(userId);
      const isCompleted = user.completedSkills?.includes(skillId);
      
      const skillInfo = `📘 *${skill.name}*\n\n` +
                       `📝 ${skill.description}\n` +
                       `🎯 Độ khó: ${skill.difficulty}\n` +
                       `⏱️ Thời gian: ${skill.duration}\n` +
                       `📊 Trạng thái: ${isCompleted ? '✅ Đã hoàn thành' : '📖 Chưa học'}`;
      
      const buttons = [[
        { text: isCompleted ? "🔄 Ôn tập lại" : "🎯 Bắt đầu học", 
          callback_data: `start_skill_${skillId}` }
      ]];
      
      buttons.push([{ text: "🔙 Quay lại", callback_data: "learn_new" }]);
      
      bot.sendMessage(chatId, skillInfo, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });
    }
  }
  else if (data.startsWith('start_skill_')) {
    const skillId = data.replace('start_skill_', '');
    startSkill(chatId, userId, skillId);
  }
  // Xử lý callback từ skills.json: skill_01_step_2, skill_01_step_3, ...
  else if (data.startsWith('skill_') && data.includes('_step_')) {
    // Pattern 1: skill_01_step_2 (từ skills.json)
    const jsonMatch = data.match(/skill_(\d+)_step_(\d+)/);
    if (jsonMatch) {
      const [, skillNum, stepNum] = jsonMatch;
      const skillId = `skill_${skillNum.padStart(2, '0')}`;
      const skill = skills.find(s => s.id === skillId);
      
      if (skill) {
        // JSON step bắt đầu từ 1, code bắt đầu từ 0
        const stepIndex = parseInt(stepNum) - 1;
        console.log(`📖 Xử lý callback từ JSON: ${data} -> skill ${skillId}, step ${stepIndex}`);
        
        if (stepIndex >= 0 && stepIndex < skill.steps.length) {
          sendSkillStep(chatId, userId, skill, stepIndex);
        }
      }
    }
    
    // Pattern 2: skill_skill_01_step_1 (từ code)
    const codeMatch = data.match(/skill_(skill_\d+)_step_(\d+)/);
    if (codeMatch) {
      const [, skillId, stepIndex] = codeMatch;
      const skill = skills.find(s => s.id === skillId);
      
      if (skill) {
        const stepNum = parseInt(stepIndex);
        console.log(`💻 Xử lý callback từ code: ${data} -> skill ${skillId}, step ${stepNum}`);
        
        if (stepNum >= 0 && stepNum < skill.steps.length) {
          sendSkillStep(chatId, userId, skill, stepNum);
        }
      }
    }
  }
  // Xử lý hoàn thành skill: skill_01_complete
  else if (data.endsWith('_complete')) {
    const skillId = data.replace('_complete', '');
    console.log(`✅ User ${userId} hoàn thành ${skillId}`);
    
    const skill = skills.find(s => s.id === skillId);
    
    if (skill) {
      database.completeSkill(userId, skillId);
      
      bot.sendMessage(chatId, 
        `🎉 *CHÚC MỪNG!*\n\nBạn đã hoàn thành:\n*${skill.name}*\n\nTiếp tục học nhé!`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "📚 Học tiếp", callback_data: "learn_new" }],
            [{ text: "🏠 Về menu", callback_data: "main_menu" }]
          ]
        }
      });
    }
  }
  // Xử lý next_skill
  else if (data === 'next_skill') {
    console.log(`➡️ User ${userId} chọn next_skill`);
    const user = database.getUser(userId);
    const completed = user.completedSkills || [];
    
    const nextSkill = skills.find(skill => !completed.includes(skill.id));
    
    if (nextSkill) {
      startSkill(chatId, userId, nextSkill.id);
    } else {
      bot.sendMessage(chatId, 
        `🎉 *XIN CHÚC MỪNG!*\n\nBạn đã hoàn thành tất cả kỹ năng!\n\nChờ các bài học mới nhé!`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: "🏠 Menu chính", callback_data: "main_menu" }]]
        }
      });
    }
  }
  // Xử lý skill_01_more_practice
  else if (data === 'skill_01_more_practice') {
    console.log(`🔄 User ${userId} muốn thực hành thêm skill_01`);
    const skill = skills.find(s => s.id === 'skill_01');
    if (skill) {
      // Quay lại step thực hành (step 4 - index 3)
      sendSkillStep(chatId, userId, skill, 3);
    }
  }
  else if (data.startsWith('free_response_')) {
    // Vào chế độ tự gõ câu trả lời với AI
    const match = data.match(/free_response_(.+)_(\d+)/);
    if (match) {
      const [, skillId, stepIndex] = match;
      
      database.updateUser(userId, { 
        aiMode: 'free_response',
        currentSkill: skillId,
        currentStep: parseInt(stepIndex)
      });
      
      bot.sendMessage(chatId,
        `💬 *CHẾ ĐỘ TỰ GÕ CÂU TRẢ LỜI*\n\n` +
        `Bạn có thể gõ câu trả lời của mình (không chọn A/B/C).\n` +
        `AI sẽ phân tích và gợi ý cải thiện.\n\n` +
        `📝 *Lưu ý:*\n` +
        `• Gửi câu ngắn gọn\n` +
        `• Dùng từ lịch sự\n` +
        `• Tập trung vào tình huống\n\n` +
        `Hãy gõ câu trả lời của bạn vào chat này!`,
        { parse_mode: 'Markdown' }
      );
    }
  }
  else if (data.startsWith('answer_')) {
    // Xử lý khi chọn đáp án A/B/C
    const match = data.match(/answer_(.+)_(\d+)_(.+)/);
    if (match) {
      const [, skillId, stepIndex, answerId] = match;
      const skill = skills.find(s => s.id === skillId);
      const stepNum = parseInt(stepIndex);

      if (skill && skill.steps[stepNum]) {
        const step = skill.steps[stepNum];
        const selectedOption = step.options.find(opt => opt.id === answerId);

        if (selectedOption) {
          let feedbackText = `*${selectedOption.is_correct ? '✅ ĐÚNG RỒI!' : '❌ CHƯA ĐÚNG'}*\n\n`;
          feedbackText += selectedOption.feedback;

          const buttons = [];
          
          if (selectedOption.is_correct) {
            feedbackText += '\n\n🎯 *Tiếp tục sang bước sau nhé!*';
            buttons.push([{ 
              text: "➡️ Tiếp tục", 
              callback_data: `skill_${skillId}_step_${stepNum + 1}`
            }]);
          } else {
            feedbackText += '\n\n🔄 *Thử lại với đáp án khác*';
            buttons.push([
              { text: "🔄 Thử lại", callback_data: `skill_${skillId}_step_${stepNum}` },
              { text: "💡 Xem gợi ý", callback_data: `hint_${skillId}_${stepNum}` }
            ]);
          }

          bot.sendMessage(chatId, feedbackText, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
          });
        }
      }
    }
  }
  else if (data.startsWith('hint_')) {
    // Hiển thị gợi ý từ AI - ĐÃ SỬA LỖI REGEX
    const match = data.match(/hint_(.+)_(\d+)/);
    if (match) {
      const [, skillId, stepIndex] = match;
      console.log(`💡 User ${userId} xin gợi ý cho skill ${skillId}, step ${stepIndex}`);
      
      const skill = skills.find(s => s.id === skillId);
      const step = skill?.steps[parseInt(stepIndex)];

      if (step && config.ENABLE_AI) {
        try {
          const hint = await deepseek.generateHint(skillId, step.content, 2);
          
          bot.sendMessage(chatId, `💡 *GỢI Ý:*\n\n${hint}`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: "🔄 Thử lại", callback_data: `skill_${skillId}_step_${stepIndex}` }
              ]]
            }
          });
        } catch (error) {
          console.error('❌ Lỗi tạo gợi ý:', error);
          bot.sendMessage(chatId, `💡 *Gợi ý:*\n\nHãy đọc kỹ câu hỏi và thử trả lời với đầy đủ thông tin nhé!`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: "🔄 Thử lại", callback_data: `skill_${skillId}_step_${stepIndex}` }
              ]]
            }
          });
        }
      }
    }
  }
  else if (data.startsWith('retry_')) {
    // Thử lại với câu khác
    const match = data.match(/retry_(.+)_(\d+)/);
    if (match) {
      const [, skillId, stepIndex] = match;
      const skill = skills.find(s => s.id === skillId);
      
      if (skill) {
        // Vào chế độ free response để thử lại
        database.updateUser(userId, { 
          aiMode: 'free_response',
          currentSkill: skillId,
          currentStep: parseInt(stepIndex)
        });
        
        bot.sendMessage(chatId,
          `🔄 *THỬ LẠI VỚI CÂU KHÁC*\n\n` +
          `Hãy gõ câu trả lời khác của bạn vào chat này!\n\n` +
          `📝 *Lưu ý:*\n` +
          `• Suy nghĩ kỹ trước khi trả lời\n` +
          `• Dùng từ lịch sự, đầy đủ\n` +
          `• Tập trung vào tình huống`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  }
  else if (data === 'view_progress') {
    const user = database.getUser(userId);
    const completed = user.completedSkills?.length || 0;
    const total = skills.length;
    const progress = Math.round((completed / total) * 100);
    
    let progressBar = '🟩'.repeat(Math.floor(progress / 10)) + 
                     '⬜'.repeat(10 - Math.floor(progress / 10));
    
    let progressText = `📊 *TIẾN ĐỘ HỌC TẬP*\n\n`;
    progressText += `${progressBar} ${progress}%\n`;
    progressText += `✅ Đã hoàn thành: ${completed}/${total} kỹ năng\n\n`;
    
    if (completed > 0) {
      progressText += `📚 *Kỹ năng đã học:*\n`;
      user.completedSkills.forEach(skillId => {
        const skill = skills.find(s => s.id === skillId);
        if (skill) progressText += `• ${skill.icon} ${skill.name}\n`;
      });
    } else {
      progressText += `Bạn chưa học kỹ năng nào. Bắt đầu ngay nhé!`;
    }
    
    bot.sendMessage(chatId, progressText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "📚 Học tiếp", callback_data: "learn_new" }],
          [{ text: "🏠 Menu chính", callback_data: "main_menu" }]
        ]
      }
    });
  }
  else if (data === 'help') {
    const helpText = `❓ *TRỢ GIÚP & HƯỚNG DẪN*\n\n` +
                    `*Cách sử dụng:*\n` +
                    `1. Chọn kỹ năng từ menu\n` +
                    `2. Đọc lý thuyết ngắn gọn\n` +
                    `3. Thực hành với tình huống mô phỏng\n` +
                    `4. Nhận phản hồi và học tiếp\n\n` +
                    `*Các lệnh:*\n` +
                    `/start - Bắt đầu/Menu chính\n` +
                    `/menu - Hiện menu\n` +
                    `/progress - Xem tiến độ\n` +
                    `/skills - Danh sách kỹ năng\n\n` +
                    `*Lưu ý:*\n` +
                    `• Dữ liệu được lưu trữ an toàn\n` +
                    `• Có thể học mọi lúc, không giới hạn\n` +
                    `• Nhấn 'Menu' để quay về`;
    
    bot.sendMessage(chatId, helpText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 Menu chính", callback_data: "main_menu" }]]
      }
    });
  }
  // Xử lý callback không xác định
  else {
    console.log(`❓ Callback không xác định: ${data}`);
    bot.sendMessage(chatId, 
      `❌ Lệnh không hợp lệ. Vui lòng chọn lại từ menu!`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 Menu chính", callback_data: "main_menu" }]]
      }
    });
  }
});

// Lệnh /menu
bot.onText(/\/menu/, (msg) => {
  sendMenu(msg.chat.id, msg.from.id);
});

// Lệnh /progress
bot.onText(/\/progress/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const user = database.getUser(userId);
  const completed = user.completedSkills?.length || 0;
  const total = skills.length;
  const progress = Math.round((completed / total) * 100);
  
  bot.sendMessage(chatId, 
    `📊 *TIẾN ĐỘ:* ${progress}%\n` +
    `✅ Đã hoàn thành: ${completed}/${total} kỹ năng`,
    { parse_mode: 'Markdown' }
  );
});

// Lệnh /skills
bot.onText(/\/skills/, (msg) => {
  sendSkillMenu(msg.chat.id, msg.from.id);
});

// Xử lý lỗi
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error);
});

bot.on('webhook_error', (error) => {
  console.error('❌ Webhook error:', error);
});

console.log('✅ Bot đã sẵn sàng!');
console.log('🤖 AI Mode:', config.AI_MODE);
console.log('👤 Test bot tại: @seed_career_coach_bot');

