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
        maxLength: 50,
        minLength: 5
      },
      
      skill_02: {
        allowedWords: ["dạ", "ạ", "em", "đã", "xong", "chưa", "mới", "một nửa"],
        forbiddenWords: ["không biết", "chưa làm", "lười"],
        templates: {
          correct: "Dạ, em mới làm được một nửa ạ.",
          too_short: "Câu trả lời hơi ngắn. Hãy nói rõ tiến độ công việc."
        },
        maxLength: 80,
        minLength: 5
      },
      
      skill_04: {
        requiredWords: ["xin", "ạ", "cách", "được không"],
        forbiddenWords: ["gì", "sao", "tại sao", "chỉ"],
        templates: {
          correct: "Anh/chị chỉ em cách in tài liệu từ máy tính với máy in này được không ạ?",
          too_short: "Câu hỏi cần rõ ràng và lịch sự hơn."
        },
        maxLength: 80
      },
      
      skill_08: {
        allowedWords: ["xin lỗi", "sửa", "hiểu", "ạ", "dạ", "em sẽ", "cảm ơn"],
        forbiddenWords: ["tại", "vì", "đổ lỗi", "bực", "giận", "không phải lỗi em"],
        templates: {
          correct: "Dạ, em xin lỗi ạ. {person} chỉ giúp em chỗ sai để em sửa ạ."
        },
        maxLength: 100
      },
      
      skill_12: {
        requiredWords: ["kính gửi", "thân ái", "cảm ơn", "tài liệu", "nội quy"],
        forbiddenWords: ["hello", "hi", "bye", "cho xin"],
        templates: {
          correct: "Xin tài liệu hướng dẫn nội quy công ty",
          too_short: "Tiêu đề email cần rõ ràng và chuyên nghiệp."
        },
        maxLength: 150
      }
    };
  }

  getSkillCategory(skillId) {
    const categories = {
      'communication': ['skill_01', 'skill_02', 'skill_03', 'skill_04', 'skill_13', 'skill_15'],
      'professional': ['skill_05', 'skill_06', 'skill_07', 'skill_11', 'skill_12', 'skill_14', 'skill_16'],
      'problem_solving': ['skill_08', 'skill_10'],
      'teamwork': ['skill_09']
    };
    
    for (const [category, skills] of Object.entries(categories)) {
      if (skills.includes(skillId)) return category;
    }
    return 'communication';
  }

  createOptimizedPrompt(skillId, userMessage, context) {
    const category = this.getSkillCategory(skillId);
    const rule = this.rules[skillId];
    
    const categoryPrompts = {
      'communication': "Phân tích kỹ năng giao tiếp. Tập trung vào: lịch sự, rõ ràng, đủ thông tin.",
      'professional': "Phân tích hành vi chuyên nghiệp. Tập trung vào: trách nhiệm, đúng hạn, báo cáo rõ ràng.",
      'problem_solving': "Phân tích giải quyết vấn đề. Tập trung vào: bình tĩnh, giải pháp, hợp tác.",
      'teamwork': "Phân tích làm việc nhóm. Tập trung vào: hỗ trợ, chia sẻ, phối hợp."
    };
    
    let prompt = `[HỆ THỐNG PHÂN TÍCH KỸ NĂNG XÃ HỘI]
Loại kỹ năng: ${categoryPrompts[category]}
Kỹ năng cụ thể: ${context.skillName}
Tình huống: ${context.scenario.substring(0, 200)}...

Câu trả lời chuẩn: "${context.correctTemplate}"
Câu người dùng: "${userMessage}"

YÊU CẦU PHÂN TÍCH (1-2 câu):
1. Điểm tốt (nếu có)
2. Điểm cần cải thiện
3. Gợi ý: "Thử nói: [câu mẫu]"

Quy tắc ngôn ngữ:
- Giọng văn: Thân thiện, động viên
- Ngôn ngữ: Tiếng Việt đơn giản
- Không sử dụng từ chuyên môn phức tạp`;

    if (rule) {
      if (rule.requiredWords) {
        prompt += `\nTừ nên có: ${rule.requiredWords.slice(0, 3).join(', ')}`;
      }
      if (rule.forbiddenWords) {
        prompt += `\nTừ nên tránh: ${rule.forbiddenWords.slice(0, 3).join(', ')}`;
      }
    }
    
    return prompt;
  }

  validateUserResponse(skillId, userMessage) {
    const rule = this.rules[skillId];
    if (!rule) return { isValid: true };

    const errors = [];
    const lowerMessage = userMessage.toLowerCase();

    // Kiểm tra độ dài tối thiểu
    if (rule.minLength && userMessage.length < rule.minLength) {
      errors.push("quá_ngắn");
    }

    // Kiểm tra từ cấm
    if (rule.forbiddenWords) {
      for (const word of rule.forbiddenWords) {
        if (lowerMessage.includes(word.toLowerCase())) {
          errors.push(`từ_cấm:${word}`);
          break;
        }
      }
    }

    // Kiểm tra từ bắt buộc (nếu có)
    if (rule.requiredWords) {
      for (const word of rule.requiredWords) {
        if (!lowerMessage.includes(word.toLowerCase())) {
          errors.push(`thiếu_từ:${word}`);
          break;
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