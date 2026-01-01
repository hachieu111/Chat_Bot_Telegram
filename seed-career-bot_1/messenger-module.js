// File: messenger-module.js
const express = require('express');
const axios = require('axios');
const config = require('./config-messenger');
const database = require('./database');
const skillsData = require('./skills.json');
const deepseek = require('./deepseek');
const aiController = require('./ai-controller');
const apiMonitor = require('./api-monitor');
const rateLimiter = require('./rate-limiter');

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const skills = skillsData.skills;
const PAGE_ACCESS_TOKEN = config.FACEBOOK_PAGE_TOKEN;
const FACEBOOK_API_URL = config.FACEBOOK_API_URL;

console.log('✅ Messenger Bot module loaded');

// ==================== HÀM TÌM KỸ NĂNG THEO TÊN ====================

function findSkillIdByApproximateName(text) {
    if (!text || typeof text !== 'string') return null;
    
    const normalize = (str) => {
        if (!str) return '';
        return str.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'd')
            .trim();
    };
    
    const normalizedText = normalize(text);
    
    if (normalizedText.length < 3) return null;
    
    for (const skill of skills) {
        const normalizedSkillName = normalize(skill.name);
        
        if (normalizedSkillName.includes(normalizedText) || 
            normalizedText.includes(normalizedSkillName) ||
            normalizedSkillName === normalizedText) {
            console.log(`🔍 Tìm thấy kỹ năng: ${skill.id} - ${skill.name}`);
            return skill.id;
        }
        
        const skillNameWords = normalizedSkillName.split(' ');
        for (const word of skillNameWords) {
            if (word.length >= 3 && normalizedText.includes(word)) {
                console.log(`🔍 Tìm thấy kỹ năng qua từ khóa: ${skill.id} - ${skill.name}`);
                return skill.id;
            }
        }
    }
    
    return null;
}

// ==================== HÀM TIỆN ÍCH MESSENGER ====================

async function sendMessage(recipientId, messageText, quickReplies = null) {
    const messageData = {
        recipient: { id: recipientId },
        message: { 
            text: messageText,
            quick_replies: quickReplies
        },
        messaging_type: 'RESPONSE'
    };

    try {
        const response = await axios.post(
            `${FACEBOOK_API_URL}/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            messageData,
            { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );
        console.log(`✅ Đã gửi tin nhắn đến ${recipientId}`);
        return response.data;
    } catch (error) {
        console.error('❌ Lỗi gửi tin Messenger:', error.response?.data?.error || error.message);
        return null;
    }
}

async function sendQuickReplies(recipientId, text, replies) {
    const quickReplies = replies.map(reply => ({
        content_type: 'text',
        title: reply.title,
        payload: reply.payload
    }));

    return await sendMessage(recipientId, text, quickReplies);
}

async function getUserInfo(senderId) {
    try {
        const response = await axios.get(
            `${FACEBOOK_API_URL}/${senderId}?fields=first_name,last_name,profile_pic&access_token=${PAGE_ACCESS_TOKEN}`,
            { timeout: 5000 }
        );
        return {
            firstName: response.data.first_name || '',
            lastName: response.data.last_name || '',
            fullName: `${response.data.first_name || ''} ${response.data.last_name || ''}`.trim(),
            profilePic: response.data.profile_pic
        };
    } catch (error) {
        console.error('❌ Không lấy được thông tin user:', error.message);
        return { firstName: '', lastName: '', fullName: 'Người dùng Facebook', profilePic: null };
    }
}

// ==================== MENU & NAVIGATION ====================

async function sendMainMenu(senderId, userId) {
    const user = database.getUser(userId);
    const completed = user.completedSkills?.length || 0;
    const total = skills.length;
    const progress = Math.round((completed / total) * 100);

    const menuText = `👋 *Chào ${user.name || 'bạn'}!*\n\n` +
        `📊 Tiến độ: ${progress}% (${completed}/${total} kỹ năng)\n\n` +
        `Chọn chức năng:`;

    const quickReplies = [
        { title: '📚 Học kỹ năng mới', payload: 'LEARN_NEW' },
        { title: '▶️ Tiếp tục học', payload: 'CONTINUE_LEARNING' },
        { title: '📈 Xem tiến độ', payload: 'VIEW_PROGRESS' },
        { title: '🏆 Thành tích', payload: 'ACHIEVEMENTS' },
        { title: '❓ Trợ giúp', payload: 'HELP' },
        { title: 'ℹ️ Giới thiệu', payload: 'ABOUT' }
    ];

    await sendQuickReplies(senderId, menuText, quickReplies);
}

async function sendSkillMenu(senderId, userId) {
    const user = database.getUser(userId);
    const completed = user.completedSkills || [];

    let skillText = '📚 *DANH SÁCH KỸ NĂNG*\n\nChọn kỹ năng bạn muốn học:\n\n';

    // Hiển thị skills theo nhóm
    for (let i = 0; i < Math.min(6, skills.length); i++) {
        const skill = skills[i];
        const isCompleted = completed.includes(skill.id);
        skillText += `${isCompleted ? '✅' : '📘'} ${skill.icon} ${skill.name}\n`;
    }

    if (skills.length > 6) {
        skillText += `\n... và ${skills.length - 6} kỹ năng khác`;
    }

    // Tạo quick replies cho 6 skill đầu tiên
    const quickReplies = skills.slice(0, 6).map(skill => ({
        title: `${skill.icon} ${skill.name.substring(0, 15)}${skill.name.length > 15 ? '...' : ''}`,
        payload: `VIEW_SKILL_${skill.id}`
    }));

    quickReplies.push({ title: '🔙 Quay lại', payload: 'MAIN_MENU' });

    await sendQuickReplies(senderId, skillText, quickReplies);
}

async function showSkillInfo(senderId, userId, skillId) {
    const skill = skills.find(s => s.id === skillId);
    if (!skill) {
        await sendMessage(senderId, '❌ Không tìm thấy kỹ năng này. Vui lòng chọn lại.');
        return;
    }
    
    const user = database.getUser(userId);
    const isCompleted = user.completedSkills?.includes(skillId);
    
    const infoText = `📘 *${skill.name}*\n\n${skill.description || 'Không có mô tả'}\n\n` +
                    `Số bước học: ${skill.steps?.length || 0}\n` +
                    `Trạng thái: ${isCompleted ? '✅ Đã hoàn thành' : '📝 Chưa học'}`;
    
    const quickReplies = [
        { title: '▶️ Bắt đầu học', payload: `START_SKILL_${skill.id}` },
        { title: '🔙 Quay lại', payload: 'LEARN_NEW' }
    ];
    
    await sendQuickReplies(senderId, infoText, quickReplies);
}

async function startSkill(senderId, userId, skillId) {
    const skill = skills.find(s => s.id === skillId);
    if (!skill) {
        await sendMessage(senderId, '❌ Không tìm thấy kỹ năng này. Vui lòng chọn lại.');
        return;
    }

    console.log(`✅ Bắt đầu kỹ năng: ${skillId} cho user ${userId}`);

    database.updateUser(userId, {
        currentSkill: skillId,
        currentStep: 0,
        aiMode: null
    });

    await sendSkillStep(senderId, userId, skill, 0);
}

async function sendSkillStep(senderId, userId, skill, stepIndex) {
    const user = database.getUser(userId);
    
    // Kiểm tra step hợp lệ
    if (stepIndex >= skill.steps.length) {
        // Hoàn thành skill
        database.completeSkill(userId, skill.id);
        database.updateUser(userId, { currentSkill: null, currentStep: null, aiMode: null });
        
        await sendMessage(senderId,
            `🎉 *CHÚC MỪNG!*\n\nBạn đã hoàn thành:\n*${skill.name}*\n\nTiếp tục học nhé!`
        );
        
        setTimeout(() => sendMainMenu(senderId, userId), 1000);
        return;
    }

    const step = skill.steps[stepIndex];
    if (!step) {
        console.error(`❌ Không tìm thấy step ${stepIndex} trong skill ${skill.id}`);
        await sendMessage(senderId, '❌ Không tìm thấy bước học này.');
        return;
    }

    let messageText = step.content.replace(/\*\*/g, '*');
    let quickReplies = [];

    switch (step.type) {
        case 'scenario':
            if (step.options) {
                step.options.forEach(opt => {
                    quickReplies.push({
                        title: `${opt.id}. ${opt.text.substring(0, 15)}${opt.text.length > 15 ? '...' : ''}`,
                        payload: `ANSWER_${skill.id}_${stepIndex}_${opt.id}`
                    });
                });
                
                if (step.ai_controlled && config.ENABLE_AI) {
                    quickReplies.push({
                        title: '💬 Tự gõ câu trả lời',
                        payload: `FREE_RESPONSE_${skill.id}_${stepIndex}`
                    });
                }
            }
            break;

        default:
            if (step.buttons) {
                step.buttons.forEach(btn => {
                    quickReplies.push({
                        title: btn.text,
                        payload: btn.callback
                    });
                });
            } else {
                const nextStep = stepIndex + 1;
                if (nextStep < skill.steps.length) {
                    quickReplies.push({
                        title: 'Tiếp tục →',
                        payload: `SKILL_${skill.id}_STEP_${nextStep}`
                    });
                } else {
                    quickReplies.push({
                        title: '✅ Hoàn thành',
                        payload: `COMPLETE_SKILL_${skill.id}`
                    });
                }
            }
    }

    // Thêm nút điều hướng
    if (stepIndex > 0) {
        quickReplies.push({
            title: '🔙 Lùi lại',
            payload: `SKILL_${skill.id}_STEP_${stepIndex - 1}`
        });
    }

    quickReplies.push({
        title: '🏠 Menu',
        payload: 'MAIN_MENU'
    });

    // Chia nhỏ message nếu quá dài
    if (messageText.length > 2000) {
        const part1 = messageText.substring(0, 2000);
        const part2 = messageText.substring(2000);
        
        await sendMessage(senderId, part1);
        setTimeout(async () => {
            await sendQuickReplies(senderId, part2, quickReplies);
        }, 500);
    } else {
        await sendQuickReplies(senderId, messageText, quickReplies);
    }

    database.updateUser(userId, { currentStep: stepIndex });
}

// ==================== XỬ LÝ AI RESPONSE ====================

async function handleAIResponseAnalysis(senderId, userId, userMessage, user) {
    const skill = skills.find(s => s.id === user.currentSkill);
    const step = skill?.steps[user.currentStep];

    if (!step || !step.ai_controlled) return;

    // Kiểm tra rate limiting
    const limitCheck = rateLimiter.checkLimit(userId, skill.id, 100);
    if (!limitCheck.allowed) {
        await sendMessage(senderId, `⚠️ ${limitCheck.reason}. Vui lòng thử lại sau.`);
        return;
    }

    // Kiểm tra số lần dùng AI
    const aiCount = database.incrementAIUsage(userId);
    if (aiCount > config.MAX_AI_REQUESTS_PER_USER) {
        await sendMessage(senderId,
            `⚠️ Bạn đã dùng hết lượt phân tích AI hôm nay.\n` +
            `Hãy chọn đáp án có sẵn hoặc thử lại ngày mai nhé!`
        );
        return;
    }

    await sendMessage(senderId, "🤖 AI đang phân tích câu trả lời của bạn...");

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

        const responseText = `💡 *PHÂN TÍCH AI:*\n\n${aiResponse.content}\n\n` +
                            `📝 *Câu mẫu tốt:*\n"${step.correct_answer_text}"`;

        await sendQuickReplies(senderId, responseText, [
            { title: '🔄 Thử lại với câu khác', payload: `RETRY_${skill.id}_${user.currentStep}` },
            { title: '➡️ Tiếp tục bài học', payload: `SKILL_${skill.id}_STEP_${user.currentStep + 1}` }
        ]);

        database.updateUser(userId, { aiMode: null });

    } catch (error) {
        console.error('❌ Lỗi phân tích AI:', error);
        apiMonitor.trackCall(user.currentSkill, 0, false);
        
        await sendMessage(senderId,
            "❌ Có lỗi khi phân tích. Hãy thử chọn đáp án có sẵn nhé!\n\n" +
            `Câu trả lời mẫu: **${step.correct_answer_text}**`
        );
    }
}

// ==================== WEBHOOK HANDLERS ====================

async function handleMessage(event) {
    const senderId = event.sender.id;
    const messageText = event.message?.text;
    const userId = `fb_${senderId}`;

    if (!messageText) return;

    console.log(`📨 Tin nhắn từ ${senderId}: "${messageText}"`);

    // Lấy thông tin user lần đầu
    const user = database.getUser(userId);
    if (!user.name) {
        const userInfo = await getUserInfo(senderId);
        database.updateUser(userId, { 
            name: userInfo.fullName,
            avatar: userInfo.profilePic
        });
    }

    // Xử lý AI free response trước
    if (user.currentSkill && user.aiMode === 'free_response') {
        await handleAIResponseAnalysis(senderId, userId, messageText, user);
        return;
    }

    // Thử tìm xem tin nhắn có phải là tên kỹ năng không
    const skillId = findSkillIdByApproximateName(messageText);
    if (skillId) {
        console.log(`🔍 Đã nhận diện tên kỹ năng: ${skillId}`);
        await showSkillInfo(senderId, userId, skillId);
        return;
    }

    // Xử lý các lệnh đặc biệt
    if (messageText.match(/^(bắt đầu|start|hello|chào|hi|xin chào)$/i)) {
        await sendMainMenu(senderId, userId);
        return;
    }
    
    if (messageText.match(/^(menu|mục lục|chức năng)$/i)) {
        await sendMainMenu(senderId, userId);
        return;
    }
    
    if (messageText.match(/^(kỹ năng|skills|học|bài học)$/i)) {
        await sendSkillMenu(senderId, userId);
        return;
    }
    
    if (messageText.match(/^(tiến độ|progress|hoàn thành)$/i)) {
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
        
        await sendQuickReplies(senderId, progressText, [
            { title: '📚 Học tiếp', payload: 'LEARN_NEW' },
            { title: '🏠 Menu chính', payload: 'MAIN_MENU' }
        ]);
        return;
    }
    
    // Xử lý mặc định
    await sendQuickReplies(senderId,
        `Tôi là SEED Career Coach! 🤖\n\n` +
        `Tôi có thể giúp bạn học các kỹ năng xã hội quan trọng cho công việc.\n\n` +
        `Hãy thử:\n` +
        `• Gõ "menu" để xem menu chính\n` +
        `• Gõ "kỹ năng" để xem danh sách bài học\n` +
        `• Gõ tên kỹ năng (ví dụ: "Chào hỏi")\n` +
        `• Hoặc chọn một tùy chọn bên dưới:`,
        [
            { title: '📚 Học ngay', payload: 'LEARN_NEW' },
            { title: 'ℹ️ Giới thiệu', payload: 'ABOUT' }
        ]
    );
}

async function handlePostback(event) {
    const senderId = event.sender.id;
    const payload = event.postback.payload;
    const userId = `fb_${senderId}`;

    console.log(`🔄 Postback từ ${senderId}: ${payload}`);

    // Phân tích payload để xác định loại action
    if (payload.startsWith('VIEW_SKILL_')) {
        const skillId = payload.replace('VIEW_SKILL_', '');
        await showSkillInfo(senderId, userId, skillId);
        return;
    }
    
    if (payload.startsWith('START_SKILL_')) {
        const skillId = payload.replace('START_SKILL_', '');
        await startSkill(senderId, userId, skillId);
        return;
    }
    
    if (payload.startsWith('SKILL_') && payload.includes('_STEP_')) {
        const match = payload.match(/SKILL_(.+)_STEP_(\d+)/);
        if (match) {
            const [, skillId, stepIndex] = match;
            const skill = skills.find(s => s.id === skillId);
            if (skill) {
                const stepNum = parseInt(stepIndex);
                if (stepNum >= 0 && stepNum < skill.steps.length) {
                    await sendSkillStep(senderId, userId, skill, stepNum);
                } else {
                    await sendMessage(senderId, '❌ Bước học không hợp lệ.');
                }
            }
        }
        return;
    }
    
    if (payload.startsWith('ANSWER_')) {
        const match = payload.match(/ANSWER_(.+)_(\d+)_(.+)/);
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

                    if (selectedOption.is_correct) {
                        feedbackText += '\n\n🎯 *Tiếp tục sang bước sau nhé!*';
                        await sendQuickReplies(senderId, feedbackText, [
                            { title: '➡️ Tiếp tục', payload: `SKILL_${skillId}_STEP_${stepNum + 1}` }
                        ]);
                    } else {
                        feedbackText += '\n\n🔄 *Thử lại với đáp án khác*';
                        await sendQuickReplies(senderId, feedbackText, [
                            { title: '🔄 Thử lại', payload: `SKILL_${skillId}_STEP_${stepNum}` },
                            { title: '💡 Xem gợi ý', payload: `HINT_${skillId}_${stepNum}` }
                        ]);
                    }
                }
            }
        }
        return;
    }
    
    if (payload.startsWith('FREE_RESPONSE_')) {
        const match = payload.match(/FREE_RESPONSE_(.+)_(\d+)/);
        if (match) {
            const [, skillId, stepIndex] = match;
            database.updateUser(userId, { 
                aiMode: 'free_response',
                currentSkill: skillId,
                currentStep: parseInt(stepIndex)
            });
            
            await sendMessage(senderId,
                `💬 *CHẾ ĐỘ TỰ GÓC CÂU TRẢ LỜI*\n\n` +
                `Bạn có thể gõ câu trả lời của mình.\n` +
                `AI sẽ phân tích và gợi ý cải thiện.\n\n` +
                `📝 *Lưu ý:*\n` +
                `• Gửi câu ngắn gọn\n` +
                `• Dùng từ lịch sự\n` +
                `• Tập trung vào tình huống\n\n` +
                `Hãy gõ câu trả lời của bạn vào chat này!`
            );
        }
        return;
    }
    
    if (payload.startsWith('RETRY_')) {
        const match = payload.match(/RETRY_(.+)_(\d+)/);
        if (match) {
            const [, skillId, stepIndex] = match;
            const skill = skills.find(s => s.id === skillId);
            
            if (skill) {
                database.updateUser(userId, { 
                    aiMode: 'free_response',
                    currentSkill: skillId,
                    currentStep: parseInt(stepIndex)
                });
                
                await sendMessage(senderId,
                    `🔄 *THỬ LẠI VỚI CÂU KHÁC*\n\n` +
                    `Hãy gõ câu trả lời khác của bạn vào chat này!\n\n` +
                    `📝 *Lưu ý:*\n` +
                    `• Suy nghĩ kỹ trước khi trả lời\n` +
                    `• Dùng từ lịch sự, đầy đủ\n` +
                    `• Tập trung vào tình huống`
                );
            }
        }
        return;
    }
    
    if (payload.startsWith('COMPLETE_SKILL_')) {
        const skillId = payload.replace('COMPLETE_SKILL_', '');
        const skill = skills.find(s => s.id === skillId);
        
        if (skill) {
            database.completeSkill(userId, skill.id);
            database.updateUser(userId, { currentSkill: null, currentStep: null, aiMode: null });
            
            await sendMessage(senderId,
                `🎉 *CHÚC MỪNG!*\n\nBạn đã hoàn thành:\n*${skill.name}*\n\nTiếp tục học nhé!`
            );
            
            setTimeout(() => sendMainMenu(senderId, userId), 1000);
        }
        return;
    }

    // Xử lý các payload cơ bản
    switch (payload) {
        case 'GET_STARTED':
            await sendMainMenu(senderId, userId);
            break;
            
        case 'LEARN_NEW':
            await sendSkillMenu(senderId, userId);
            break;
            
        case 'CONTINUE_LEARNING':
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
                await sendSkillStep(senderId, userId, skillToContinue, startStep);
            } else {
                await sendMessage(senderId,
                    `🎉 *XIN CHÚC MỪNG!*\n\nBạn đã hoàn thành tất cả kỹ năng!\n\nChờ các bài học mới nhé!`
                );
                setTimeout(() => sendMainMenu(senderId, userId), 1000);
            }
            break;
            
        case 'VIEW_PROGRESS':
            const userForProgress = database.getUser(userId);
            const completed = userForProgress.completedSkills?.length || 0;
            const total = skills.length;
            const progress = Math.round((completed / total) * 100);
            
            let progressText = `📊 *TIẾN ĐỘ HỌC TẬP*\n\n`;
            progressText += `✅ Đã hoàn thành: ${completed}/${total} kỹ năng\n`;
            progressText += `📈 Tiến độ: ${progress}%\n\n`;
            
            if (completed > 0) {
                progressText += `🏆 *Kỹ năng đã học:*\n`;
                userForProgress.completedSkills.slice(0, 5).forEach(skillId => {
                    const skill = skills.find(s => s.id === skillId);
                    if (skill) progressText += `• ${skill.icon} ${skill.name}\n`;
                });
                if (completed > 5) progressText += `... và ${completed - 5} kỹ năng khác\n`;
            }
            
            await sendQuickReplies(senderId, progressText, [
                { title: '📚 Học tiếp', payload: 'LEARN_NEW' },
                { title: '🏠 Menu chính', payload: 'MAIN_MENU' }
            ]);
            break;
            
        case 'ACHIEVEMENTS':
            const userForAchievements = database.getUser(userId);
            const completedCount = userForAchievements.completedSkills?.length || 0;
            const totalSkills = skills.length;
            
            let achievementsText = `🏆 *THÀNH TÍCH CỦA BẠN*\n\n`;
            achievementsText += `✅ Đã hoàn thành: ${completedCount}/${totalSkills} kỹ năng\n\n`;
            
            if (completedCount > 0) {
                let totalScore = 0;
                let count = 0;
                Object.keys(userForAchievements.scores || {}).forEach(skillId => {
                    totalScore += userForAchievements.scores[skillId];
                    count++;
                });
                const avgScore = count > 0 ? Math.round(totalScore / count) : 0;
                
                achievementsText += `📊 Điểm trung bình: ${avgScore}/100\n`;
                achievementsText += `🤖 Số lần dùng AI: ${userForAchievements.aiUsageCount || 0}\n\n`;
                
                if (completedCount >= totalSkills) {
                    achievementsText += `👑 *DANH HIỆU: BẬC THẦY GIAO TIẾP*\n`;
                } else if (completedCount >= totalSkills * 0.7) {
                    achievementsText += `⭐ *DANH HIỆU: CHUYÊN GIA*\n`;
                } else if (completedCount >= totalSkills * 0.4) {
                    achievementsText += `👍 *DANH HIỆU: NGƯỜI HỌC TÍCH CỰC*\n`;
                } else {
                    achievementsText += `🌱 *DANH HIỆU: NGƯỜI MỚI BẮT ĐẦU*\n`;
                }
            } else {
                achievementsText += `📝 Bạn chưa có thành tích nào. Hãy bắt đầu học ngay nhé!\n`;
            }
            
            await sendQuickReplies(senderId, achievementsText, [
                { title: '📚 Học ngay', payload: 'LEARN_NEW' },
                { title: '🏠 Menu chính', payload: 'MAIN_MENU' }
            ]);
            break;
            
        case 'HELP':
            const helpText = `❓ *TRỢ GIÚP & HƯỚNG DẪN*\n\n` +
                            `*Cách sử dụng:*\n` +
                            `1. Chọn kỹ năng từ menu\n` +
                            `2. Đọc lý thuyết ngắn gọn\n` +
                            `3. Thực hành với tình huống mô phỏng\n` +
                            `4. Nhận phản hồi và học tiếp\n\n` +
                            `*Lưu ý:*\n` +
                            `• Dữ liệu được lưu trữ an toàn\n` +
                            `• Có thể học mọi lúc, không giới hạn\n` +
                            `• Nhấn 'Menu' để quay về`;
            
            await sendQuickReplies(senderId, helpText, [
                { title: '🏠 Menu chính', payload: 'MAIN_MENU' }
            ]);
            break;
            
        case 'ABOUT':
            const aboutText = `ℹ️ *GIỚI THIỆU VỀ SEED CAREER SKILLS*\n\n` +
                            `🤖 *Tên bot:* SEED Career Coach\n` +
                            `🎯 *Mục tiêu:* Hỗ trợ phát triển kỹ năng xã hội\n` +
                            `📚 *Số kỹ năng:* ${skills.length} kỹ năng\n` +
                            `👥 *Đối tượng:* Mọi người muốn cải thiện kỹ năng công việc\n\n` +
                            `💡 *Tính năng chính:*\n` +
                            `• Học kỹ năng giao tiếp cơ bản\n` +
                            `• Thực hành tình huống thực tế\n` +
                            `• Phản hồi từ AI thông minh\n` +
                            `• Theo dõi tiến độ học tập`;
            
            await sendQuickReplies(senderId, aboutText, [
                { title: '🏠 Menu chính', payload: 'MAIN_MENU' }
            ]);
            break;
            
        case 'MAIN_MENU':
            await sendMainMenu(senderId, userId);
            break;
            
        default:
            console.log(`❌ Postback không xác định: ${payload}`);
            await sendMessage(senderId, 'Xin lỗi, tôi không hiểu yêu cầu này. Vui lòng thử lại.');
            break;
    }
}

// ==================== WEBHOOK ENDPOINTS ====================

router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.FACEBOOK_VERIFY_TOKEN) {
        console.log('✅ Messenger Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Messenger Verification failed. Token mismatch.');
        res.sendStatus(403);
    }
});

router.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        if (body.object === 'page') {
            for (const entry of body.entry) {
                const webhookEvent = entry.messaging[0];
                
                if (!webhookEvent) continue;

                if (webhookEvent.message) {
                    await handleMessage(webhookEvent);
                } else if (webhookEvent.postback) {
                    await handlePostback(webhookEvent);
                }
            }
            res.status(200).send('EVENT_RECEIVED');
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('❌ Lỗi xử lý webhook:', error);
        res.sendStatus(500);
    }
});

// ==================== SETUP FACEBOOK MESSENGER PROFILE ====================

async function setupMessengerProfile() {
    try {
        // Setup Get Started Button
        const getStartedConfig = {
            get_started: {
                payload: 'GET_STARTED'
            }
        };

        await axios.post(
            `${FACEBOOK_API_URL}/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
            getStartedConfig
        );
        console.log('✅ Get Started button đã được cài đặt');

        // Setup Persistent Menu
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
                            type: 'web_url',
                            title: '🌐 Website SEED',
                            url: 'https://seedvn.org',
                            webview_height_ratio: 'full'
                        }
                    ]
                }
            ]
        };

        await axios.post(
            `${FACEBOOK_API_URL}/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
            menuConfig
        );
        console.log('✅ Persistent menu đã được cài đặt');

    } catch (error) {
        console.error('❌ Lỗi cài đặt Messenger Profile:', error.response?.data?.error || error.message);
    }
}

// ==================== HEALTH CHECK ====================

router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        platform: 'Facebook Messenger',
        timestamp: new Date().toISOString(),
        skills_count: skills.length,
        ai_enabled: config.ENABLE_AI,
        ai_mode: config.AI_MODE
    });
});

// ==================== SETUP MESSENGER PROFILE WHEN MODULE LOADS ====================

if (PAGE_ACCESS_TOKEN && process.env.NODE_ENV === 'production') {
    setupMessengerProfile().then(() => {
        console.log('✅ Messenger profile setup completed');
    }).catch(error => {
        console.error('❌ Messenger profile setup failed:', error.message);
    });
}

// ==================== EXPORT ====================

module.exports = {
    router,
    setupMessengerProfile
};