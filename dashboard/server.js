/**
 * Dashboard Server — with Password Authentication
 *
 * All routes protected by session cookie.
 * Set DASHBOARD_PASSWORD in .env to change the password (default: orb2026).
 *
 * Public (no auth): /health, /callback, /login, /logout
 */

import express from 'express';
import cors    from 'cors';
import fs      from 'fs/promises';
import path    from 'path';
import crypto  from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = 3000;

// ─── Auth ─────────────────────────────────────────────────────────────────────

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'orb2026';
const SESSION_SECRET     = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME        = 'orb_session';
const VALID_TOKEN        = crypto.createHmac('sha256', SESSION_SECRET)
                               .update(DASHBOARD_PASSWORD).digest('hex');

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';')
      .map(c => c.trim().split('=').map(s => decodeURIComponent(s || '')))
      .filter(([k]) => k)
  );
}

function isAuthenticated(req) {
  return parseCookies(req)[COOKIE_NAME] === VALID_TOKEN;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth guard
const PUBLIC = ['/login', '/logout', '/health', '/callback'];
app.use((req, res, next) => {
  if (PUBLIC.some(p => req.path === p || req.path.startsWith(p + '?'))) return next();
  if (isAuthenticated(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect('/login');
});

app.use(express.static(__dirname));

// ─── Login / Logout ───────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/');
  const err = req.query.error ? '<div style="color:#f87171;margin-bottom:14px;padding:10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px">Invalid password.</div>' : '';
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ORB Bot Login</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,sans-serif;background:#0a0b0e;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}.card{background:#111318;border:1px solid #1e2330;border-radius:12px;padding:40px;width:100%;max-width:380px;box-shadow:0 25px 60px rgba(0,0,0,.5)}.logo{text-align:center;margin-bottom:28px}.icon{width:48px;height:48px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px}h1{font-size:20px;font-weight:600;color:#f1f5f9}p{font-size:13px;color:#64748b;margin-top:4px}label{display:block;font-size:12px;font-weight:500;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}input[type=password]{width:100%;padding:12px 14px;background:#0d0f14;border:1px solid #1e2330;border-radius:8px;color:#e2e8f0;font-size:15px;font-family:Inter,sans-serif;outline:none}input[type=password]:focus{border-color:#3b82f6}button{width:100%;padding:12px;margin-top:18px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;border-radius:8px;color:#fff;font-size:15px;font-weight:600;cursor:pointer}</style></head><body><div class="card"><div class="logo"><div class="icon"><svg width="22" height="22" viewBox="0 0 18 18" fill="none"><path d="M9 1.5L2 6v10.5h5V12h4v4.5h5V6Z" fill="currentColor"/></svg></div><h1>ORB Trading Bot</h1><p>Live Dashboard — Restricted Access</p></div>${err}<form method="POST" action="/login"><label for="pw">Password</label><input type="password" id="pw" name="password" autofocus autocomplete="current-password" placeholder="Dashboard password"><button type="submit">Access Dashboard</button></form></div></body></html>`);
});

app.post('/login', (req, res) => {
  if (req.body.password === DASHBOARD_PASSWORD) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${VALID_TOKEN}; HttpOnly; SameSite=Strict; Max-Age=43200; Path=/`);
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

app.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/`);
  res.redirect('/login');
});

// Upstox OAuth callback
app.get('/callback', (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No authorization code received.');
  res.send(`<!DOCTYPE html><html><head><title>Auth Code</title><style>body{font-family:monospace;background:#0a0b0e;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}.box{background:#111318;border:1px solid #1e2330;border-radius:12px;padding:32px;max-width:600px;width:100%}h2{color:#3b82f6;margin-bottom:16px}code{background:#0d0f14;padding:12px;border-radius:8px;display:block;word-break:break-all;color:#22c55e}button{margin-top:16px;padding:10px 20px;background:#3b82f6;border:none;border-radius:8px;color:white;cursor:pointer}</style></head><body><div class="box"><h2>Authorization Code</h2><p style="margin-bottom:12px;color:#94a3b8">Copy and use on EC2:</p><code>${code}</code><button onclick="navigator.clipboard.writeText('${code}');this.textContent='Copied!'">Copy Code</button></div></body></html>`);
});

// Paths
const LOGS_DIR   = path.join(__dirname, '..', 'logs');
const TRADES_DIR = path.join(LOGS_DIR, 'trades');
const DATA_DIR   = path.join(__dirname, '..', 'data');

/**
 * API: Get bot status
 */
app.get('/api/status', async (req, res) => {
    try {
        // Read from bot state file (if exists)
        const stateFile = path.join(DATA_DIR, 'bot_state.json');
        
        try {
            const stateData = await fs.readFile(stateFile, 'utf8');
            const state = JSON.parse(stateData);
            res.json(state);
        } catch {
            // State file doesn't exist - bot not running
            res.json({
                isRunning: false,
                sessionState: 'OFFLINE',
                currentPosition: null,
                risk: {
                    capital: 100000,
                    dailyLossLimit: 2000,
                    tradesCount: 0,
                    maxTradesPerDay: 2,
                    circuitBreakerTriggered: false
                }
            });
        }
    } catch (error) {
        console.error('Error reading status:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * API: Get all trades
 */
app.get('/api/trades', async (req, res) => {
    try {
        const trades = [];
        
        // Read all trade JSON files
        const files = await fs.readdir(TRADES_DIR);
        const jsonFiles = files.filter(f => f.startsWith('trades_') && f.endsWith('.json'));
        
        for (const file of jsonFiles) {
            const filePath = path.join(TRADES_DIR, file);
            const data = await fs.readFile(filePath, 'utf8');
            const fileTrades = JSON.parse(data);
            trades.push(...fileTrades);
        }
        
        // Sort by date (newest first)
        trades.sort((a, b) => 
            new Date(b.entry.time) - new Date(a.entry.time)
        );
        
        res.json(trades);
    } catch (error) {
        console.error('Error reading trades:', error);
        res.json([]);
    }
});

/**
 * API: Get performance metrics
 */
app.get('/api/performance', async (req, res) => {
    try {
        // Read all trades
        const tradesResponse = await fetchTrades();
        const trades = tradesResponse;
        
        if (trades.length === 0) {
            return res.json(getEmptyPerformance());
        }
        
        // Calculate metrics
        const performance = calculatePerformance(trades);
        
        res.json(performance);
    } catch (error) {
        console.error('Error calculating performance:', error);
        res.json(getEmptyPerformance());
    }
});

/**
 * API: Get system health
 */
app.get('/api/health', async (req, res) => {
    try {
        // Read latest main log file
        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(LOGS_DIR, `main_${today}.log`);
        
        let errors = [];
        let lastDataUpdate = null;
        let wsConnected = false;
        let candlesCount = 0;
        
        try {
            const logData = await fs.readFile(logFile, 'utf8');
            const lines = logData.split('\n').slice(-100); // Last 100 lines
            
            // Parse log lines for errors/warnings
            lines.forEach(line => {
                if (line.includes('ERROR') || line.includes('WARN')) {
                    const timestamp = extractTimestamp(line);
                    const message = line.substring(line.indexOf(']') + 1).trim();
                    errors.push({
                        timestamp,
                        level: line.includes('ERROR') ? 'error' : 'warning',
                        message
                    });
                }
                
                // Check for WebSocket connected
                if (line.includes('WebSocket connected')) {
                    wsConnected = true;
                }
                
                // Check for candle completed
                if (line.includes('Candle completed')) {
                    candlesCount++;
                    lastDataUpdate = extractTimestamp(line);
                }
            });
        } catch {
            // Log file doesn't exist
        }
        
        res.json({
            wsConnected,
            lastDataUpdate,
            candlesCount,
            errors: errors.slice(-10) // Last 10 errors
        });
    } catch (error) {
        console.error('Error reading health:', error);
        res.json({
            wsConnected: false,
            lastDataUpdate: null,
            candlesCount: 0,
            errors: []
        });
    }
});

/**
 * API: Activate kill switch
 */
app.post('/api/kill-switch', async (req, res) => {
    try {
        const killSwitchFile = path.join(__dirname, '..', '.kill-switch');
        await fs.writeFile(killSwitchFile, new Date().toISOString());
        
        console.log('🛑 Kill switch activated via dashboard');
        
        res.json({ 
            success: true, 
            message: 'Kill switch activated' 
        });
    } catch (error) {
        console.error('Error activating kill switch:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * Helper: Fetch trades
 */
async function fetchTrades() {
    const trades = [];
    
    try {
        const files = await fs.readdir(TRADES_DIR);
        const jsonFiles = files.filter(f => f.startsWith('trades_') && f.endsWith('.json'));
        
        for (const file of jsonFiles) {
            const filePath = path.join(TRADES_DIR, file);
            const data = await fs.readFile(filePath, 'utf8');
            const fileTrades = JSON.parse(data);
            trades.push(...fileTrades);
        }
    } catch (error) {
        console.error('Error fetching trades:', error);
    }
    
    return trades;
}

/**
 * Helper: Calculate performance metrics
 */
function calculatePerformance(trades) {
    const totalTrades = trades.length;
    
    // Raw metrics
    const rawWins = trades.filter(t => t.pnl.raw > 0);
    const rawLosses = trades.filter(t => t.pnl.raw <= 0);
    const rawWinRate = (rawWins.length / totalTrades) * 100;
    
    // Adjusted metrics
    const adjWins = trades.filter(t => t.pnl.adjusted > 0);
    const adjLosses = trades.filter(t => t.pnl.adjusted <= 0);
    const adjustedWinRate = (adjWins.length / totalTrades) * 100;
    
    // P&L
    const totalRawPnL = trades.reduce((sum, t) => sum + t.pnl.raw, 0);
    const totalAdjustedPnL = trades.reduce((sum, t) => sum + t.pnl.adjusted, 0);
    const totalCosts = trades.reduce((sum, t) => sum + t.pnl.difference, 0);
    
    // Profit factors
    const rawGrossProfit = rawWins.reduce((sum, t) => sum + t.pnl.raw, 0);
    const rawGrossLoss = Math.abs(rawLosses.reduce((sum, t) => sum + t.pnl.raw, 0));
    const rawProfitFactor = rawGrossLoss > 0 ? rawGrossProfit / rawGrossLoss : 0;
    
    const adjGrossProfit = adjWins.reduce((sum, t) => sum + t.pnl.adjusted, 0);
    const adjGrossLoss = Math.abs(adjLosses.reduce((sum, t) => sum + t.pnl.adjusted, 0));
    const adjustedProfitFactor = adjGrossLoss > 0 ? adjGrossProfit / adjGrossLoss : 0;
    
    // Cost analysis
    const averageCostPercent = totalRawPnL !== 0 
        ? (totalCosts / Math.abs(totalRawPnL)) * 100 
        : 0;
    
    const tradesErasedByCosts = trades.filter(t => 
        t.pnl.raw > 0 && t.pnl.adjusted <= 0
    ).length;
    
    // Daily P&L (today only)
    const today = new Date().toISOString().split('T')[0];
    const todayTrades = trades.filter(t => 
        t.entry.time.startsWith(today)
    );
    const dailyPnL = todayTrades.reduce((sum, t) => sum + t.pnl.adjusted, 0);
    
    return {
        totalTrades,
        wins: adjWins.length,
        losses: adjLosses.length,
        rawWinRate,
        adjustedWinRate,
        rawProfitFactor,
        adjustedProfitFactor,
        totalRawPnL,
        totalAdjustedPnL,
        totalCosts,
        averageCostPercent,
        tradesErasedByCosts,
        dailyPnL
    };
}

/**
 * Helper: Get empty performance object
 */
function getEmptyPerformance() {
    return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        rawWinRate: 0,
        adjustedWinRate: 0,
        rawProfitFactor: 0,
        adjustedProfitFactor: 0,
        totalRawPnL: 0,
        totalAdjustedPnL: 0,
        totalCosts: 0,
        averageCostPercent: 0,
        tradesErasedByCosts: 0,
        dailyPnL: 0
    };
}

/**
 * Helper: Extract timestamp from log line
 */
function extractTimestamp(line) {
    const match = line.match(/\[(.*?)\]/);
    return match ? match[1] : new Date().toISOString();
}

// Serve dashboard (auth handled by middleware)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check — always public
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});


app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('Dashboard Server Started — AUTH ENABLED');
    console.log('='.repeat(60));
    console.log(`URL      : http://localhost:${PORT}`);
    console.log(`Password : ${DASHBOARD_PASSWORD}`);
    console.log(`Session  : 12 hours`);
    console.log('='.repeat(60));
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});
