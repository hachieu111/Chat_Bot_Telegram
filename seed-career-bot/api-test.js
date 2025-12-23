// File: api-test.js
const deepseek = require('./deepseek');
const aiController = require('./ai-controller');

class APITest {
  constructor() {
    this.testCases = [
      {
        skillId: 'skill_01',
        userMessage: "Dạ em chào cô ạ",
        expected: "positive"
      },
      {
        skillId: 'skill_01',
        userMessage: "Chào",
        expected: "negative"
      },
      {
        skillId: 'skill_08',
        userMessage: "Dạ em xin lỗi ạ",
        expected: "positive"
      }
    ];
  }
  
  async runTests() {
    console.log('🧪 Bắt đầu test API...');
    
    for (const testCase of this.testCases) {
      console.log(`\nTest: ${testCase.skillId}`);
      console.log(`Input: "${testCase.userMessage}"`);
      
      const validation = aiController.validateUserResponse(testCase.skillId, testCase.userMessage);
      console.log(`Validation: ${validation.isValid ? '✅' : '❌'}`, validation.errors);
      
      if (testCase.expected === 'positive' && !validation.isValid) {
        console.log('❌ FAIL: Câu tích cực nhưng validation failed');
      } else if (testCase.expected === 'negative' && validation.isValid) {
        console.log('❌ FAIL: Câu tiêu cực nhưng validation passed');
      } else {
        console.log('✅ PASS');
      }
    }
  }
}

if (require.main === module) {
  const test = new APITest();
  test.runTests();
}

module.exports = APITest;