// File: prompt-templates.js
module.exports = {
  communication: {
    systemPrompt: "Bạn là trợ lý dạy kỹ năng giao tiếp cho người tự kỷ.",
    focusPoints: ["lịch sự", "rõ ràng", "đủ thông tin", "phù hợp ngữ cảnh"],
    examples: [
      { good: "Dạ, em chào cô ạ!", bad: "Chào" },
      { good: "Dạ, em xin lỗi vì đã làm phiền ạ", bad: "Xin lỗi" }
    ]
  },
  
  professional: {
    systemPrompt: "Bạn là trợ lý dạy kỹ năng chuyên nghiệp tại nơi làm việc.",
    focusPoints: ["trách nhiệm", "đúng hạn", "báo cáo rõ ràng", "thái độ tích cực"],
    examples: [
      { good: "Dạ, em sẽ hoàn thành trong 2 giờ nữa ạ", bad: "Lâu lắm" },
      { good: "Em xin phép về sớm 30 phút ạ", bad: "Em về nhé" }
    ]
  },
  
  problem_solving: {
    systemPrompt: "Bạn là trợ lý dạy kỹ năng giải quyết vấn đề và xử lý mâu thuẫn.",
    focusPoints: ["bình tĩnh", "lắng nghe", "đề xuất giải pháp", "hợp tác"],
    examples: [
      { good: "Dạ, chúng ta có thể thảo luận để tìm giải pháp chung ạ", bad: "Tại anh/chị sai" },
      { good: "Em hiểu ý anh/chị, em sẽ sửa ngay ạ", bad: "Không phải lỗi em" }
    ]
  }
};