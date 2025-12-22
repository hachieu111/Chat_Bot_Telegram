// File: deepseek.js
const axios = require('axios');
const config = require('./config');
const aiController = require('./ai-controller');

class DeepSeekAI {
  constructor() {
    this.apiKey = config.DEEPSEEK_API_KEY;
    this.apiUrl = config.DEEPSEEK_API_URL;
    this.enabled = config.ENABLE_AI && this.apiKey;
    
    if (this.enabled) {
      console.log('🤖 DeepSeek AI đã sẵn sàng');
    } else {
      console.log('🤖 DeepSeek AI đang tắt');
    }
  }

  async analyzeResponse(skillId, userMessage, context) {
    if (!this.enabled) {
      return {
        content: "AI đang tạm bảo trì. Hãy tiếp tục học nhé!",
        tokens: 0
      };
    }

    // Kiểm tra cache trước
    const cacheKey = `${skillId}:${userMessage.toLowerCase().trim()}`;
    const cached = aiController.getCachedResponse(cacheKey);
    if (cached) {
      console.log('📦 Trả về từ cache');
      return cached;
    }

    try {
      // Tạo prompt an toàn
      const safePrompt = aiController.createSafePrompt(skillId, userMessage, context);
      
      const response = await axios.post(
        this.apiUrl,
        {
          model: "deepseek-chat",
          messages: [
            { role: "system", content: safePrompt },
            { role: "user", content: userMessage }
          ],
          temperature: 0.3, // Thấp để ít sáng tạo
          max_tokens: 200,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 giây timeout
        }
      );

      const result = {
        content: response.data.choices[0].message.content,
        tokens: response.data.usage.total_tokens
      };

      // Lưu vào cache
      aiController.cacheResponse(cacheKey, result);
      
      console.log(`🤖 Đã dùng ${result.tokens} tokens`);
      return result;

    } catch (error) {
      console.error('❌ Lỗi DeepSeek API:', error.message);
      
      // Fallback: dùng template cứng
      const validation = aiController.validateUserResponse(skillId, userMessage);
      if (!validation.isValid && validation.suggestedTemplate) {
        return {
          content: `Câu trả lời ${validation.errors.join(', ')}.\n\nHãy thử: **${validation.suggestedTemplate}**`,
          tokens: 0
        };
      }
      
      return {
        content: "Xin lỗi, AI tạm thời gặp sự cố. Hãy thử lại sau!",
        tokens: 0
      };
    }
  }

  async generateHint(skillId, question, attempts) {
    // Tương tự như trên, tạo prompt cho gợi ý
    const prompt = `Đưa ra gợi ý cho câu hỏi: "${question}"
    
Người học đã sai ${attempts} lần.
Gợi ý phải:
- Ngắn gọn (1 câu)
- Hướng dẫn cách suy nghĩ
- KHÔNG tiết lộ đáp án
- Bằng tiếng Việt đơn giản`;

    const response = await axios.post(
      this.apiUrl,
      {
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 100
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  }
}

module.exports = new DeepSeekAI();
