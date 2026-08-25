/**
 * Telegram Alert Notifier
 *
 * Sends real-time trade alerts and end-of-day summaries to your Telegram bot.
 *
 * Setup (one-time, 2 minutes):
 *   1. Open Telegram → search @BotFather → /newbot → copy the token
 *   2. Send any message to your new bot
 *   3. Visit: https://api.telegram.org/bot<TOKEN>/getUpdates
 *      Copy the "id" from chat.id in the response
 *   4. Add to your .env:
 *        TELEGRAM_BOT_TOKEN=123456:ABCDEF...
 *        TELEGRAM_CHAT_ID=987654321
 *
 * Message types sent:
 *   🟢 ENTRY  — when a position is opened
 *   🔴 EXIT   — when a position is closed (with P&L)
 *   📊 EOD    — end-of-day summary (sent at market close)
 *   🛑 ALERT  — circuit breaker / kill switch / VIX halt
 *   💓 ALIVE  — daily heartbeat at 9:00 AM confirming bot is running
 */

import https from 'https';

class TelegramNotifier {
  constructor(config, logger) {
    this.logger   = logger;
    this.enabled  = false;
    this.token    = null;
    this.chatId   = null;

    // Resolve from config OR environment variables (env takes priority)
    const token  = process.env.TELEGRAM_BOT_TOKEN
                || config?.alerts?.telegram?.botToken;
    const chatId = process.env.TELEGRAM_CHAT_ID
                || config?.alerts?.telegram?.chatId;
    const enabled = config?.alerts?.telegram?.enabled !== false; // default true if token present

    if (token && chatId && enabled) {
      this.token   = token;
      this.chatId  = String(chatId);
      this.enabled = true;
      this.logger?.info('✅ Telegram notifier enabled', { chatId: this.chatId });
    } else {
      this.logger?.info('ℹ️  Telegram notifier disabled (no token/chatId configured)');
    }

    // Rate limit: max 1 message per second (Telegram API limit)
    this._queue = [];
    this._sending = false;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Bot is alive — sent at 9:00 AM every trading day */
  async sendHeartbeat(config = {}) {
    const { vix, capital, instrument = 'NIFTY' } = config;
    const vixLine = vix ? `📈 Est. VIX: ${vix.toFixed(1)}` : '';
    const regime  = vix >= 25 ? '🛑 HALTED'
                  : vix >= 20 ? '⚠️  ELEVATED (50% size)'
                  : vix >= 12 ? '✅ OPTIMAL'
                  : '⬇️  LOW (75% size)';

    return this._send(`💓 *BOT ALIVE* — ${new Date().toLocaleDateString('en-IN')}
─────────────────────
🏦 Instrument: ${instrument}
💰 Capital: ₹${this._fmt(capital)}
${vixLine}
🌡️ VIX Regime: ${regime}
⏰ Market opens: 09:15 IST`);
  }

  /** Fired immediately on ENTRY */
  async sendEntry(trade) {
    const { direction, optionType, strike, premium, quantity,
            totalInvestment, stopLoss, target, daysToExpiry,
            instrument = 'NIFTY', vixAtEntry, sizingMultiplier } = trade;

    const emoji  = direction === 'LONG' ? '🟢' : '🔴';
    const dte    = daysToExpiry !== undefined ? `${parseFloat(daysToExpiry).toFixed(1)} DTE` : '';
    const sizing = sizingMultiplier !== undefined && sizingMultiplier < 1
      ? `\n⚡ Size reduced: ${Math.round(sizingMultiplier * 100)}% (VIX/expiry filter)`
      : '';

    return this._send(`${emoji} *${direction} ENTRY* — ${instrument}
─────────────────────
📋 ${optionType} ${strike} ${dte}
💵 Premium: ₹${this._fmt(premium, 0)} × ${quantity} lots
💰 Investment: ₹${this._fmt(totalInvestment, 0)}
🛑 Stop Loss: ₹${this._fmt(stopLoss, 0)} premium
🎯 Target: ₹${this._fmt(target, 0)} premium
🌡️ VIX: ${vixAtEntry ? vixAtEntry.toFixed(1) : 'N/A'}${sizing}
⏰ ${this._time()}`);
  }

  /** Fired immediately on EXIT */
  async sendExit(trade) {
    const { direction, optionType, strike,
            entryPremium, exitPremium,
            pnlPercent, totalPnL,
            exitReason, quantity,
            instrument = 'NIFTY' } = trade;

    const win    = pnlPercent > 0;
    const emoji  = win ? '✅' : (exitReason === 'STOP_LOSS' ? '🛑' : '🔚');
    const pnlEmoji = win ? '📈' : '📉';

    return this._send(`${emoji} *EXIT* — ${instrument} ${optionType} ${strike}
─────────────────────
${pnlEmoji} P&L: ${win ? '+' : ''}${pnlPercent.toFixed(2)}% (₹${win ? '+' : ''}${this._fmt(totalPnL, 0)})
📋 ${direction} | ${exitReason}
💵 Entry: ₹${this._fmt(entryPremium, 0)} → Exit: ₹${this._fmt(exitPremium, 0)}
🔢 Qty: ${quantity} lots
⏰ ${this._time()}`);
  }

  /** End-of-day summary — call this at market close */
  async sendEODSummary(stats) {
    const {
      date, instrument = 'NIFTY', strategy,
      totalTrades = 0, winningTrades = 0, losingTrades = 0,
      totalPnL = 0, totalPnLPercent = 0,
      capital, finalCapital,
      maxDrawdown = 0, winRate,
      bestTrade = 0, worstTrade = 0,
      stoppedReason
    } = stats;

    const pnlSign  = totalPnL >= 0 ? '+' : '';
    const pnlEmoji = totalPnL >= 0 ? '📈' : '📉';
    const wr       = winRate ?? (totalTrades > 0 ? Math.round(winningTrades / totalTrades * 100) : 0);
    const stopLine = stoppedReason ? `\n⚠️ Stopped: ${stoppedReason}` : '';

    return this._send(`📊 *END OF DAY — ${date || new Date().toLocaleDateString('en-IN')}*
─────────────────────
🏦 ${instrument} | ${strategy || 'ORB'}
─────────────────────
${pnlEmoji} Net P&L: ${pnlSign}₹${this._fmt(Math.abs(totalPnL), 0)} (${pnlSign}${parseFloat(totalPnLPercent).toFixed(2)}%)
💰 Capital: ₹${this._fmt(capital, 0)} → ₹${this._fmt(finalCapital, 0)}
─────────────────────
📋 Trades: ${totalTrades} (✅${winningTrades} / ❌${losingTrades})
🎯 Win Rate: ${wr}%
📈 Best: +₹${this._fmt(bestTrade, 0)}
📉 Worst: -₹${this._fmt(Math.abs(worstTrade), 0)}
📉 Max Drawdown: ${parseFloat(maxDrawdown).toFixed(1)}%${stopLine}
─────────────────────
_Next session: Tomorrow 09:00 IST_`);
  }

  /** Critical alert — circuit breaker, kill switch, VIX halt */
  async sendAlert(type, message, details = {}) {
    const emoji = {
      CIRCUIT_BREAKER: '⚡',
      KILL_SWITCH:     '🚨',
      VIX_HALT:        '🛑',
      STALE_DATA:      '📡',
      ERROR:           '💥',
      DAILY_LOSS:      '🔴',
    }[type] || '⚠️';

    const detailLines = Object.entries(details)
      .map(([k, v]) => `  • ${k}: ${v}`)
      .join('\n');

    return this._send(`${emoji} *${type}* ALERT
─────────────────────
${message}
${detailLines ? `\n${detailLines}` : ''}
⏰ ${this._time()}`);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  _fmt(n, decimals = 2) {
    const num = parseFloat(n) || 0;
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  _time() {
    return new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false
    }) + ' IST';
  }

  /** Queue messages to avoid Telegram rate limits */
  _send(text) {
    if (!this.enabled) return Promise.resolve(null);

    return new Promise((resolve) => {
      this._queue.push({ text, resolve });
      if (!this._sending) this._flush();
    });
  }

  async _flush() {
    this._sending = true;
    while (this._queue.length > 0) {
      const { text, resolve } = this._queue.shift();
      try {
        const result = await this._post(text);
        resolve(result);
      } catch (err) {
        this.logger?.warn('Telegram send failed', { error: err.message });
        resolve(null);
      }
      // Rate limit: 1 msg/sec
      if (this._queue.length > 0) await new Promise(r => setTimeout(r, 1100));
    }
    this._sending = false;
  }

  _post(text) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        chat_id:    this.chatId,
        text:       text,
        parse_mode: 'Markdown'
      });

      const options = {
        hostname: 'api.telegram.org',
        path:     `/bot${this.token}/sendMessage`,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) {
              resolve(parsed);
            } else {
              this.logger?.warn('Telegram API error', { response: parsed });
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Telegram timeout')); });
      req.write(body);
      req.end();
    });
  }
}

export default TelegramNotifier;
