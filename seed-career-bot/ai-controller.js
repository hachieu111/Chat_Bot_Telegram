// File: ai-controller.js
const config = require('./config');

class AIController {
  constructor() {
    this.rules = this.loadRules();
    this.responseCache = new Map();
  }

  loadRules() {
    return {
      skill_01: {
        allowedWords: ["dạ", "chào", "ạ", "em", "cô", "thầy", "anh", "chị"],
        forbiddenWords: ["ồ", "uhm", "ừ", "ok", "hello", "hi", "yeah"],
        templates: {
          correct: "Dạ, em chào {title} ạ!",
          too_short: "Câu trả lời hơi ngắn. Thử nói: 'Dạ, em chào cô ạ!'",
          missing_word: "Thiếu từ '{word}'. Thử nói: 'Dạ, em chào cô ạ!'"
        },
        maxLength: 50
      },
      skill_08: {
        allowedWords: ["xin lỗi", "sửa", "hiểu", "ạ", "dạ", "em sẽ", "cảm ơn"],
        forbiddenWords: ["tại", "vì", "đổ lỗi", "bực", "giận", "không phải lỗi em"],
        templates: {
          correct: "Dạ, em xin lỗi ạ. {person} chỉ giúp em chỗ sai để em sửa ạ."
        },
        maxLength: 100
      }
    };
  }

  createSafePrompt(skillId, userMessage, context) {
    const rule = this.rules[skillId];
    
    let prompt = `Bạn là trợ lý dạy kỹ năng xã hội cho người Việt Nam.
    
KỸ NĂNG: ${context.skillName}
TÌNH HUỐNG: ${context.scenario}

NGƯỜI DÙNG TRẢ LỜI: "${userMessage}"

YÊU CẦU BẮT BUỘC:
1. CHỈ phân tích dựa trên mẫu: "${context.correctTemplate}"
2. KHÔNG sáng tạo câu trả lời mới
3. KHÔNG dùng từ tiếng Anh
4. KHÔNG dùng từ phức tạp

PHÂN TÍCH NGẮN GỌN (1-2 câu):
- Điểm đúng: 
- Điểm cần cải thiện: 
- Gợi ý: "Thử nói: [câu mẫu]"

GIỌNG VĂN: Thân thiện, động viên, tiếng Việt đơn giản.`;

    if (rule) {
      prompt += `\n\nQUY TẮC RIÊNG:\n`;
      if (rule.allowedWords) {
        prompt += `- Nên dùng: ${rule.allowedWords.slice(0, 5).join(', ')}\n`;
      }
      if (rule.forbiddenWords) {
        prompt += `- KHÔNG dùng: ${rule.forbiddenWords.slice(0, 5).join(', ')}\n`;
      }
    }

    return prompt;
  }

  validateUserResponse(skillId, userMessage) {
    const rule = this.rules[skillId];
    if (!rule) return { isValid: true };

    const errors = [];
    
    // Kiểm tra độ dài
    if (userMessage.length < 5) {
      errors.push("quá_ngắn");
    }
    
    if (rule.maxLength && userMessage.length > rule.maxLength) {
      errors.push("quá_dài");
    }
    
    // Kiểm tra từ cấm
    if (rule.forbiddenWords) {
      for (const word of rule.forbiddenWords) {
        if (userMessage.toLowerCase().includes(word)) {
          errors.push(`từ_cấm:${word}`);
          break;
        }
      }
    }
    
    // Kiểm tra từ bắt buộc (với skill_01)
    if (skillId === 'skill_01') {
      const required = ['dạ', 'chào', 'ạ'];
      for (const word of required) {
        if (!userMessage.toLowerCase().includes(word)) {
          errors.push(`thiếu_từ:${word}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestedTemplate: rule?.templates?.correct || ""
    };
  }

  getCachedResponse(key) {
    const cached = this.responseCache.get(key);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 phút
      return cached.response;
    }
    return null;
  }

  cacheResponse(key, response) {
    this.responseCache.set(key, {
      response,
      timestamp: Date.now()
    });
    
    // Giới hạn cache size
    if (this.responseCache.size > 100) {
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }
  }
}

module.exports = new AIController();
