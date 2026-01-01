// File: telegram-module.js
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const database = require('./database');
const skillsData = require('./skills.json');
const deepseek = require('./deepseek');
const aiController = require('./ai-controller');
const apiMonitor = require('./api-monitor');
const rateLimiter = require('./rate-limiter');

const router = express.Router();

// ==================== KHỞI TẠO BOT ====================
let bot = null;
const skills = skillsData.skills;

function initializeBot() {
    const token = process.env.TELEGRAM_TOKEN || config.TELEGRAM_TOKEN;
    
    if (!token || token.includes('YOUR_TELEGRAM_BOT_TOKEN_HERE')) {
        console.error('❌ ERROR: TELEGRAM_TOKEN is not set or invalid!');
        return null;
    }

    try {
        const maskedToken = token.substring(0, 10) + '...' + token.substring(token.length - 5);
        console.log(`🤖 Telegram Token: ${maskedToken}`);
        
        bot = new TelegramBot(token, {
            polling: false,
            onlyFirstMatch: true,
            request: {
                timeout: 30000,
                agentOptions: {
                    keepAlive: true,
                    keepAliveMsecs: 10000
                }
            }
        });

        console.log('✅ Telegram Bot initialized (module mode)');
        setupEventHandlers();
        return bot;
    } catch (error) {
        console.error('❌ Failed to initialize Telegram Bot:', error.message);
        return null;
    }
}

// ==================== CÁC HÀM TIỆN ÍCH TELEGRAM ====================

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

function showSkillInfo(chatId, userId, skillId) {
    const skill = skills.find(s => s.id === skillId);
    if (!skill) {
        bot.sendMessage(chatId, '❌ Không tìm thấy kỹ năng này. Vui lòng chọn lại.', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
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

function startSkill(chatId, userId, skillId) {
    const skill = skills.find(s => s.id === skillId);
    if (!skill) return;

    database.updateUser(userId, {
        currentSkill: skillId,
        currentStep: 0,
        aiMode: null
    });

    sendSkillStep(chatId, userId, skill, 0);
}

function sendSkillStep(chatId, userId, skill, stepIndex) {
    const user = database.getUser(userId);
    
    if (stepIndex >= skill.steps.length) {
        database.completeSkill(userId, skill.id);
        database.updateUser(userId, { currentSkill: null, currentStep: null, aiMode: null });
        
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
        bot.sendMessage(chatId, '❌ Không tìm thấy bước học này.', { parse_mode: 'Markdown' });
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

    database.updateUser(userId, { currentStep: stepIndex });
}

// ==================== XỬ LÝ AI RESPONSE ====================

async function handleAIResponseAnalysis(chatId, userId, userMessage, user) {
    const skill = skills.find(s => s.id === user.currentSkill);
    const step = skill?.steps[user.currentStep];

    if (!step || !step.ai_controlled) return;

    // Kiểm tra rate limiting
    const limitCheck = rateLimiter.checkLimit(userId, skill.id, 100);
    if (!limitCheck.allowed) {
        bot.sendMessage(chatId, `⚠️ ${limitCheck.reason}. Vui lòng thử lại sau.`, {
            parse_mode: 'Markdown'
        });
        return;
    }

    // Kiểm tra số lần dùng AI
    const aiCount = database.incrementAIUsage(userId);
    if (aiCount > config.MAX_AI_REQUESTS_PER_USER) {
        bot.sendMessage(chatId,
            `⚠️ Bạn đã dùng hết lượt phân tích AI hôm nay.\n` +
            `Hãy chọn đáp án có sẵn hoặc thử lại ngày mai nhé!`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const analyzingMsg = await bot.sendMessage(chatId, "🤖 AI đang phân tích câu trả lời của bạn...", {
        parse_mode: 'Markdown'
    });

    try {
        const validation = aiController.validateUserResponse(user.currentSkill, userMessage);
        
        let aiResponse;
        if (!validation.isValid && config.AI_MODE === 'controlled') {
            aiResponse = {
                content: `💡 *Gợi ý:*\n\n` +
                        `Câu trả lời ${validation.errors.includes('quá_ngắn') ? 'hơi ngắn' : 'có thể cải thiện'}.\n` +
                        `**Thử nói:** ${validation.suggestedTemplate || step.correct_answer_text}`,
                tokens: 0
            };
            
            apiMonitor.trackCall(user.currentSkill, 0, true);
        } else {
            const context = {
                skillName: skill.name,
                scenario: step.content,
                correctTemplate: step.correct_answer_text || ""
            };
            
            aiResponse = await deepseek.analyzeResponse(user.currentSkill, userMessage, context);
        }

        await bot.deleteMessage(chatId, analyzingMsg.message_id);

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

        database.updateUser(userId, { aiMode: null });

    } catch (error) {
        console.error('❌ Lỗi phân tích AI:', error);
        await bot.deleteMessage(chatId, analyzingMsg.message_id);
        apiMonitor.trackCall(user.currentSkill, 0, false);
        
        bot.sendMessage(chatId,
            "❌ Có lỗi khi phân tích. Hãy thử chọn đáp án có sẵn nhé!\n\n" +
            `Câu trả lời mẫu: **${step.correct_answer_text}**`,
            { parse_mode: 'Markdown' }
        );
    }
}

// ==================== EVENT HANDLERS ====================

function setupEventHandlers() {
    if (!bot) return;

    // Lệnh /start
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const firstName = msg.from.first_name || '';

        console.log(`👤 Telegram User: ${userId} - ${firstName}`);

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

        setTimeout(() => {
            const user = database.getUser(userId);
            if (!user.name) {
                bot.sendMessage(chatId, "Đầu tiên, cho mình biết tên của bạn nhé!\n\nGửi tên của bạn vào chat này:", {
                    reply_markup: {
                        force_reply: true,
                        selective: true
                    },
                    parse_mode: 'Markdown'
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
        
        if (user.currentSkill && user.aiMode === 'free_response') {
            await handleAIResponseAnalysis(chatId, userId, text, user);
        }
    });

    // Xử lý callback queries
    bot.on('callback_query', async (callbackQuery) => {
        const msg = callbackQuery.message;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;

        console.log(`🔘 Telegram Callback: ${data} từ user ${userId}`);

        await bot.answerCallbackQuery(callbackQuery.id);

        // Xử lý các callback dựa trên data
        if (data === 'main_menu') {
            sendMenu(chatId, userId);
        }
        else if (data === 'learn_new') {
            sendSkillMenu(chatId, userId);
        }
        else if (data === 'continue_learning') {
            const user = database.getUser(userId);
            let skillToContinue = null;
            
            if (user.currentSkill) {
                skillToContinue = skills.find(s => s.id === user.currentSkill);
            }
            
            if (!skillToContinue) {
                const completed = user.completedSkills || [];
                skillToContinue = skills.find(skill => !completed.includes(skill.id));
            }
            
            if (skillToContinue) {
                const startStep = user.currentSkill === skillToContinue.id ? user.currentStep : 0;
                sendSkillStep(chatId, userId, skillToContinue, startStep);
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
        else if (data.startsWith('view_skill_')) {
            const skillId = data.replace('view_skill_', '');
            showSkillInfo(chatId, userId, skillId);
        }
        else if (data.startsWith('start_skill_')) {
            const skillId = data.replace('start_skill_', '');
            startSkill(chatId, userId, skillId);
        }
        else if (data.startsWith('skill_') && data.includes('_step_')) {
            const match = data.match(/skill_(.+)_step_(\d+)/);
            if (match) {
                const [, skillId, stepIndex] = match;
                const skill = skills.find(s => s.id === skillId);
                
                if (skill) {
                    const stepNum = parseInt(stepIndex);
                    if (stepNum >= 0 && stepNum < skill.steps.length) {
                        sendSkillStep(chatId, userId, skill, stepNum);
                    } else {
                        bot.sendMessage(chatId, '❌ Bước học không hợp lệ.', { parse_mode: 'Markdown' });
                    }
                }
            }
        }
        else if (data.startsWith('answer_')) {
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
        else if (data.startsWith('free_response_')) {
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
        else if (data.startsWith('retry_')) {
            const match = data.match(/retry_(.+)_(\d+)/);
            if (match) {
                const [, skillId, stepIndex] = match;
                const skill = skills.find(s => s.id === skillId);
                
                if (skill) {
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
        else if (data.startsWith('complete_skill_')) {
            const skillId = data.replace('complete_skill_', '');
            const skill = skills.find(s => s.id === skillId);
            
            if (skill) {
                database.completeSkill(userId, skill.id);
                database.updateUser(userId, { currentSkill: null, currentStep: null, aiMode: null });
                
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
        else if (data === 'view_progress') {
            const user = database.getUser(userId);
            const completed = user.completedSkills?.length || 0;
            const total = skills.length;
            const progress = Math.round((completed / total) * 100);
            
            let progressText = `📊 *TIẾN ĐỘ HỌC TẬP*\n\n`;
            progressText += `✅ Đã hoàn thành: ${completed}/${total} kỹ năng\n`;
            progressText += `📈 Tiến độ: ${progress}%\n\n`;
            
            if (completed > 0) {
                progressText += `🏆 *Kỹ năng đã học:*\n`;
                user.completedSkills.slice(0, 5).forEach(skillId => {
                    const skill = skills.find(s => s.id === skillId);
                    if (skill) progressText += `• ${skill.icon} ${skill.name}\n`;
                });
                if (completed > 5) progressText += `... và ${completed - 5} kỹ năng khác\n`;
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
        else if (data === 'achievements') {
            const user = database.getUser(userId);
            const completed = user.completedSkills?.length || 0;
            const total = skills.length;
            
            let achievementsText = `🏆 *THÀNH TÍCH CỦA BẠN*\n\n`;
            achievementsText += `✅ Đã hoàn thành: ${completed}/${total} kỹ năng\n\n`;
            
            if (completed > 0) {
                let totalScore = 0;
                let count = 0;
                Object.keys(user.scores || {}).forEach(skillId => {
                    totalScore += user.scores[skillId];
                    count++;
                });
                const avgScore = count > 0 ? Math.round(totalScore / count) : 0;
                
                achievementsText += `📊 Điểm trung bình: ${avgScore}/100\n`;
                achievementsText += `🤖 Số lần dùng AI: ${user.aiUsageCount || 0}\n\n`;
                
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
        else if (data === 'about') {
            const aboutText = `ℹ️ *GIỚI THIỆU VỀ SEED CAREER COACH*\n\n` +
                             `🤖 *Tên bot:* SEED Career Coach\n` +
                             `🎯 *Mục tiêu:* Hỗ trợ phát triển kỹ năng xã hội\n` +
                             `📚 *Số kỹ năng:* ${skills.length} kỹ năng\n` +
                             `👥 *Đối tượng:* Mọi người muốn cải thiện kỹ năng công việc\n\n` +
                             `💡 *Tính năng chính:*\n` +
                             `• Học kỹ năng giao tiếp cơ bản\n` +
                             `• Thực hành tình huống thực tế\n` +
                             `• Phản hồi từ AI thông minh\n` +
                             `• Theo dõi tiến độ học tập`;
            
            bot.sendMessage(chatId, aboutText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: "🏠 Menu chính", callback_data: "main_menu" }]]
                }
            });
        }
        else {
            console.log(`❓ Telegram Callback không xác định: ${data}`);
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
}

// ==================== SETUP WEBHOOK ====================

async function setupTelegramWebhook() {
    if (!bot) {
        bot = initializeBot();
        if (!bot) return;
    }
     // Debug: In ra tất cả biến môi trường liên quan đến URL
    console.log('🔍 Debug Environment Variables:');
    console.log('  RENDER_EXTERNAL_URL:', process.env.RENDER_EXTERNAL_URL);
    console.log('  NGROK_URL:', process.env.NGROK_URL);
    console.log('  BASE_URL:', process.env.BASE_URL);
    console.log('  PORT:', process.env.PORT);

    const baseUrl = process.env.BASE_URL || 
                   process.env.RENDER_EXTERNAL_URL ||
                   process.env.NGROK_URL ||
                   `http://localhost:${process.env.PORT || 3000}`;
    
    const webhookUrl = `${baseUrl}/telegram/webhook`;
    
    try {
        await bot.deleteWebHook();
        console.log('🗑️ Old Telegram webhook deleted');
        
        await bot.setWebHook(webhookUrl, {
            max_connections: 40,
            allowed_updates: ['message', 'callback_query', 'chat_member']
        });
        
        console.log(`✅ Telegram webhook set to: ${webhookUrl.replace(/:[^/]+/, ':*****')}`);
        
        const webhookInfo = await bot.getWebHookInfo();
        console.log('📊 Telegram Webhook Info:', {
            url: webhookInfo.url ? 'Set' : 'Not set',
            pendingUpdates: webhookInfo.pending_update_count,
            lastError: webhookInfo.last_error_date ? 'Yes' : 'None'
        });
        
    } catch (error) {
        console.error('❌ Telegram webhook setup failed:', error.message);
    }
}

// ==================== WEBHOOK ENDPOINT ====================
router.get('/webhook', (req, res) => {
    res.json({
        message: 'Telegram webhook endpoint is active!',
        method: 'Use POST method for Telegram updates',
        timestamp: new Date().toISOString(),
        service: 'SEED Career Bot - Telegram Module',
        status: 'online'
    });
});
router.get('/test', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Telegram Webhook Test</title>
            <style>
                body { font-family: Arial; padding: 20px; }
                .success { color: green; }
                .info { background: #f0f0f0; padding: 10px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>✅ Telegram Webhook is Active</h1>
            <div class="info">
                <h3>Endpoint Information:</h3>
                <p><strong>URL:</strong> https://chat-bot-telegram-iiwf.onrender.com/telegram/webhook</p>
                <p><strong>Method:</strong> POST (for Telegram updates)</p>
                <p><strong>Test GET:</strong> You're seeing this page means GET works!</p>
            </div>
            <h3>Next Steps:</h3>
            <ol>
                <li>Set this URL in your Telegram Bot via BotFather: <code>https://chat-bot-telegram-iiwf.onrender.com/telegram/webhook</code></li>
                <li>Test by sending a message to your bot</li>
                <li>Check server logs for incoming messages</li>
            </ol>
        </body>
        </html>
    `);
});
router.post('/webhook', (req, res) => {
    if (!bot) {
        bot = initializeBot();
        if (!bot) {
            return res.status(503).send('Telegram bot not initialized');
        }
    }
    
    const updateId = req.body.update_id;
    console.log(`📩 Telegram webhook received - Update ID: ${updateId}`);
    
    bot.processUpdate(req.body);
    res.sendStatus(200);
    
});

// ==================== WEBHOOK INFO ENDPOINT ====================

router.get('/webhook-info', async (req, res) => {
    if (!bot) {
        return res.status(503).json({ error: 'Bot not initialized' });
    }
    
    try {
        const info = await bot.getWebHookInfo();
        res.json({
            url: info.url,
            hasCustomCertificate: info.has_custom_certificate,
            pendingUpdateCount: info.pending_update_count,
            lastErrorDate: info.last_error_date,
            lastErrorMessage: info.last_error_message,
            maxConnections: info.max_connections,
            allowedUpdates: info.allowed_updates
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== KHỞI TẠO BOT NGAY KHI MODULE LOAD ====================

if (!bot) {
    initializeBot();
}

// ==================== EXPORT ====================

module.exports = {
    router,
    bot,
    setupTelegramWebhook
};