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

  /** Bot is alive -- sent at 9:00 AM every trading day */
  async sendHeartbeat(config = {}) {
    const { vix, capital, instrument = 'NIFTY' } = config;
    const regime = !vix    ? 'UNKNOWN'
                 : vix >= 25 ? 'HALT'
                 : vix >= 20 ? 'ELEVATED  [-50% size]'
                 : vix >= 12 ? 'OPTIMAL'
                 :             'LOW       [-25% size]';

    return this._send(
`\`\`\`
SYSTEM ONLINE     ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
${'='.repeat(34)}
Instrument  : ${instrument}
Capital     : INR ${this._fmt(capital, 0)}
VIX Proxy   : ${vix ? vix.toFixed(1) : 'N/A'}
Regime      : ${regime}
Session     : 09:15 - 15:20 IST
Status      : MONITORING
\`\`\``);
  }

  /** Fired immediately on ENTRY */
  async sendEntry(trade) {
    const { direction, optionType, strike, premium, quantity,
            totalInvestment, stopLoss, target, daysToExpiry,
            instrument = 'NIFTY', vixAtEntry, sizingMultiplier } = trade;

    const sizeNote = sizingMultiplier !== undefined && sizingMultiplier < 1
      ? `\nSize Adj    : ${Math.round(sizingMultiplier * 100)}% (VIX/expiry filter)`
      : '';

    return this._send(
`\`\`\`
ORDER FILLED      ${this._time()}
${'='.repeat(34)}
Side        : ${direction}
Instrument  : ${instrument} ${optionType} ${strike}
DTE         : ${parseFloat(daysToExpiry ?? 0).toFixed(1)}
Premium     : INR ${this._fmt(premium, 0)}
Lots        : ${quantity}
Deployed    : INR ${this._fmt(totalInvestment, 0)}
Stop Loss   : INR ${this._fmt(stopLoss, 0)}
Target      : INR ${this._fmt(target, 0)}
VIX         : ${vixAtEntry ? vixAtEntry.toFixed(1) : 'N/A'}${sizeNote}
\`\`\``);
  }

  /** Fired immediately on EXIT */
  async sendExit(trade) {
    const { direction, optionType, strike,
            entryPremium, exitPremium,
            pnlPercent, totalPnL,
            exitReason, quantity,
            instrument = 'NIFTY' } = trade;

    const result   = pnlPercent >= 0 ? 'PROFIT' : 'LOSS';
    const pnlSign  = pnlPercent >= 0 ? '+' : '';

    return this._send(
`\`\`\`
POSITION CLOSED   ${result}
${'='.repeat(34)}
Instrument  : ${instrument} ${optionType} ${strike}
Side        : ${direction}
Exit Reason : ${exitReason}
Entry       : INR ${this._fmt(entryPremium, 0)}
Exit        : INR ${this._fmt(exitPremium, 0)}
Lots        : ${quantity}
P&L         : ${pnlSign}${pnlPercent.toFixed(2)}%  (INR ${pnlSign}${this._fmt(totalPnL, 0)})
Time        : ${this._time()}
\`\`\``);
  }

  /** End-of-day summary */
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

    const wr      = winRate ?? (totalTrades > 0 ? Math.round(winningTrades / totalTrades * 100) : 0);
    const pnlSign = totalPnL >= 0 ? '+' : '';
    const stopLine= stoppedReason ? `Halted      : ${stoppedReason}` : '';

    return this._send(
`\`\`\`
SESSION REPORT    ${date || new Date().toLocaleDateString('en-IN')}
${'='.repeat(34)}
Instrument  : ${instrument} / ${strategy || 'ORB'}
${'─'.repeat(34)}
Net P&L     : ${pnlSign}INR ${this._fmt(Math.abs(totalPnL), 0)}  (${pnlSign}${parseFloat(totalPnLPercent).toFixed(2)}%)
Capital     : INR ${this._fmt(capital, 0)}  ->  INR ${this._fmt(finalCapital, 0)}
${'─'.repeat(34)}
Trades      : ${totalTrades}  [W:${winningTrades}  L:${losingTrades}]
Win Rate    : ${wr}%
Drawdown    : ${parseFloat(maxDrawdown).toFixed(2)}%
Best        : +INR ${this._fmt(bestTrade, 0)}
Worst       : -INR ${this._fmt(Math.abs(worstTrade), 0)}
${stopLine ? stopLine + '\n' : ''}${'─'.repeat(34)}
Next        : ${new Date(Date.now() + 86400000).toLocaleDateString('en-IN')}  09:15 IST
\`\`\``);
  }

  /** Critical alert */
  async sendAlert(type, message, details = {}) {
    const detailLines = Object.entries(details)
      .map(([k, v]) => `${String(k).padEnd(12)}: ${v}`)
      .join('\n');

    return this._send(
`\`\`\`
ALERT :: ${type}
${'='.repeat(34)}
${message}
${detailLines ? `${'─'.repeat(34)}\n${detailLines}\n` : ''}Time        : ${this._time()}
\`\`\``);
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
