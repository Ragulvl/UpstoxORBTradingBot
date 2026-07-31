import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';

class Logger {
  constructor(config) {
    this.logLevel = config?.level || 'info';
    this.logDir = config?.directory || './logs';
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getTimestamp() {
    return format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
  }

  getLogFilePath(type = 'main') {
    const date = format(new Date(), 'yyyy-MM-dd');
    return path.join(this.logDir, `${type}_${date}.log`);
  }

  log(level, message, data = {}) {
    const timestamp = this.getTimestamp();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data
    };

    const logString = JSON.stringify(logEntry);
    
    // Console output
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);

    // File output
    const logFile = this.getLogFilePath('main');
    fs.appendFileSync(logFile, logString + '\n');

    // If it's a trade action, also log to trades file
    if (data.type === 'trade' || data.type === 'order') {
      const tradeFile = this.getLogFilePath('trades');
      fs.appendFileSync(tradeFile, logString + '\n');
    }
  }

  info(message, data = {}) {
    this.log('info', message, data);
  }

  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  error(message, data = {}) {
    this.log('error', message, data);
  }

  debug(message, data = {}) {
    if (this.logLevel === 'debug') {
      this.log('debug', message, data);
    }
  }

  trade(action, details) {
    this.log('trade', action, { type: 'trade', ...details });
  }

  order(action, details) {
    this.log('order', action, { type: 'order', ...details });
  }

  audit(action, details) {
    const auditFile = this.getLogFilePath('audit');
    const timestamp = this.getTimestamp();
    const auditEntry = JSON.stringify({
      timestamp,
      action,
      ...details
    });
    fs.appendFileSync(auditFile, auditEntry + '\n');
  }
}

export default Logger;
