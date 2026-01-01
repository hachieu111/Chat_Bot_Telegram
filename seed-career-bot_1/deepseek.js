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

  async callAPIWithRetry(prompt, maxRetries = 2) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await axios.post(
          this.apiUrl,
          {
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 150,
            stream: false
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 8000
          }
        );
        
        return {
          content: response.data.choices[0].message.content,
          tokens: response.data.usage.total_tokens
        };
      } catch (error) {
        console.error(`❌ Lỗi API (lần ${attempt + 1}):`, error.message);
        
        if (attempt === maxRetries - 1) throw error;
        
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  async analyzeResponse(skillId, userMessage, context) {
    if (!this.enabled) {
      return {
        content: "AI đang tạm bảo trì. Hãy tiếp tục học nhé!",
        tokens: 0
      };
    }

    const cacheKey = `${skillId}:${userMessage.toLowerCase().trim()}`;
    const cached = aiController.getCachedResponse(cacheKey);
    if (cached) {
      console.log('📦 Trả về từ cache');
      return cached;
    }

    try {
      const safePrompt = aiController.createOptimizedPrompt(skillId, userMessage, context);
      const result = await this.callAPIWithRetry(safePrompt);
      
      if (result.content.length > 500) {
        result.content = result.content.substring(0, 500) + "...";
      }
      
      aiController.cacheResponse(cacheKey, result);
      
      console.log(`🤖 Đã dùng ${result.tokens} tokens`);
      return result;
      
    } catch (error) {
      console.error('❌ Lỗi DeepSeek API sau khi retry:', error.message);
      
      const validation = aiController.validateUserResponse(skillId, userMessage);
      if (!validation.isValid && validation.suggestedTemplate) {
        return {
          content: `💡 *Gợi ý:*\n\nCâu trả lời ${validation.errors.join(', ')}.\n\n**Thử nói:** ${validation.suggestedTemplate}`,
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
    const prompt = `Đưa ra gợi ý cho câu hỏi: "${question}"
    
Người học đã sai ${attempts} lần.
Gợi ý phải:
- Ngắn gọn (1 câu)
- Hướng dẫn cách suy nghĩ
- KHÔNG tiết lộ đáp án
- Bằng tiếng Việt đơn giản`;

    try {
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
    } catch (error) {
      console.error('❌ Lỗi tạo gợi ý:', error);
      return "Hãy đọc kỹ câu hỏi và thử trả lời với đầy đủ thông tin nhé!";
    }
  }
}

module.exports = new DeepSeekAI();