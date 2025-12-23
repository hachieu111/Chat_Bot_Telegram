// File: api-monitor.js
const fs = require('fs');
const path = require('path');

class APIMonitor {
  constructor() {
    this.logFile = path.join(__dirname, 'api-usage.log');
    this.metrics = {
      totalCalls: 0,
      totalTokens: 0,
      successfulCalls: 0,
      failedCalls: 0,
      bySkill: {},
      byHour: {}
    };
    
    setInterval(() => this.saveMetrics(), 300000);
    this.loadMetrics();
  }
  
  trackCall(skillId, tokens, success = true) {
    const hour = new Date().getHours();
    
    this.metrics.totalCalls++;
    this.metrics.totalTokens += tokens;
    
    if (success) {
      this.metrics.successfulCalls++;
    } else {
      this.metrics.failedCalls++;
    }
    
    if (!this.metrics.bySkill[skillId]) {
      this.metrics.bySkill[skillId] = { calls: 0, tokens: 0 };
    }
    this.metrics.bySkill[skillId].calls++;
    this.metrics.bySkill[skillId].tokens += tokens;
    
    if (!this.metrics.byHour[hour]) {
      this.metrics.byHour[hour] = 0;
    }
    this.metrics.byHour[hour]++;
    
    this.logDetail({
      timestamp: new Date().toISOString(),
      skillId,
      tokens,
      success
    });
  }
  
  logDetail(entry) {
    const logLine = `${entry.timestamp} | ${entry.skillId} | ${entry.tokens} tokens | ${entry.success ? 'SUCCESS' : 'FAILED'}\n`;
    
    fs.appendFile(this.logFile, logLine, (err) => {
      if (err) console.error('❌ Lỗi ghi log:', err);
    });
  }
  
  saveMetrics() {
    const metricsFile = path.join(__dirname, 'api-metrics.json');
    fs.writeFileSync(metricsFile, JSON.stringify(this.metrics, null, 2));
  }
  
  loadMetrics() {
    const metricsFile = path.join(__dirname, 'api-metrics.json');
    if (fs.existsSync(metricsFile)) {
      try {
        this.metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
      } catch (error) {
        console.error('❌ Lỗi đọc metrics:', error);
      }
    }
  }
  
  getReport() {
    const successRate = this.metrics.totalCalls > 0 
      ? ((this.metrics.successfulCalls / this.metrics.totalCalls) * 100).toFixed(1)
      : 0;
    
    const avgTokensPerCall = this.metrics.totalCalls > 0
      ? Math.round(this.metrics.totalTokens / this.metrics.totalCalls)
      : 0;
    
    return {
      totalCalls: this.metrics.totalCalls,
      totalTokens: this.metrics.totalTokens,
      successfulCalls: this.metrics.successfulCalls,
      failedCalls: this.metrics.failedCalls,
      successRate: `${successRate}%`,
      avgTokensPerCall,
      bySkill: this.metrics.bySkill,
      estimatedCost: this.estimateCost()
    };
  }
  
  estimateCost() {
    const costPer1KTokens = 0.001;
    return (this.metrics.totalTokens / 1000) * costPer1KTokens;
  }
}

module.exports = new APIMonitor();