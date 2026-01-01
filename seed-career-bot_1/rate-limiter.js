    // File: rate-limiter.js
class RateLimiter {
  constructor() {
    this.userLimits = new Map();
    this.globalLimit = {
      requestsPerMinute: 60,
      tokensPerHour: 100000
    };
    
    setInterval(() => {
      this.resetHourlyCounters();
    }, 3600000);
  }
  
  checkLimit(userId, skillId, tokens) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    
    if (!this.userLimits.has(userId)) {
      this.userLimits.set(userId, {
        requests: {},
        tokensUsed: 0,
        lastReset: now
      });
    }
    
    const userLimit = this.userLimits.get(userId);
    
    if (!userLimit.requests[minute]) {
      userLimit.requests[minute] = 0;
    }
    
    if (userLimit.requests[minute] >= 10) {
      return { allowed: false, reason: 'Quá nhiều request trong phút' };
    }
    
    if (userLimit.tokensUsed >= 5000) {
      return { allowed: false, reason: 'Đã dùng hết tokens cho giờ này' };
    }
    
    userLimit.requests[minute]++;
    userLimit.tokensUsed += tokens;
    
    for (const [min, count] of Object.entries(userLimit.requests)) {
      if (parseInt(min) < minute - 5) {
        delete userLimit.requests[min];
      }
    }
    
    return { allowed: true };
  }
  
  resetHourlyCounters() {
    const now = Date.now();
    for (const [userId, limits] of this.userLimits.entries()) {
      if (now - limits.lastReset >= 3600000) {
        limits.tokensUsed = 0;
        limits.lastReset = now;
      }
    }
  }
  
  getUserStats(userId) {
    const userLimit = this.userLimits.get(userId);
    return userLimit ? {
      tokensUsed: userLimit.tokensUsed,
      lastReset: userLimit.lastReset
    } : null;
  }
}

module.exports = new RateLimiter();