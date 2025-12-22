// File: database.js
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'users.json');

class Database {
  constructor() {
    this.users = this.loadUsers();
    setInterval(() => this.saveUsers(), 30000); // Auto-save 30s
  }

  loadUsers() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ Lỗi đọc database:', error);
    }
    return {};
  }

  saveUsers() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.users, null, 2));
    } catch (error) {
      console.error('❌ Lỗi lưu database:', error);
    }
  }

  getUser(userId) {
    if (!this.users[userId]) {
      this.users[userId] = {
        id: userId,
        name: '',
        currentSkill: null,
        currentStep: 0,
        completedSkills: [],
        scores: {},
        aiUsageCount: 0,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      this.saveUsers();
    }
    return this.users[userId];
  }

  updateUser(userId, updates) {
    const user = this.getUser(userId);
    Object.assign(user, updates);
    user.lastActive = new Date().toISOString();
    this.saveUsers();
    return user;
  }

  incrementAIUsage(userId) {
    const user = this.getUser(userId);
    user.aiUsageCount = (user.aiUsageCount || 0) + 1;
    this.saveUsers();
    return user.aiUsageCount;
  }

  completeSkill(userId, skillId, score = 100) {
    const user = this.getUser(userId);
    if (!user.completedSkills.includes(skillId)) {
      user.completedSkills.push(skillId);
    }
    user.scores[skillId] = score;
    user.currentSkill = null;
    user.currentStep = 0;
    this.saveUsers();
    return user;
  }
}

module.exports = new Database();
