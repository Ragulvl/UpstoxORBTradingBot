/**
 * Dashboard Server
 * 
 * Simple Express server that:
 * 1. Serves the dashboard HTML/CSS/JS
 * 2. Provides API endpoints that READ from bot's logs/trade journal
 * 3. DOES NOT interact with bot's trading logic
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Paths
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const TRADES_DIR = path.join(LOGS_DIR, 'trades');
const DATA_DIR = path.join(__dirname, '..', 'data');

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

/**
 * Serve dashboard
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Health check endpoint — used by Docker HEALTHCHECK and AWS load balancers
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
    });
});


app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('📊 Dashboard Server Started');
    console.log('='.repeat(60));
    console.log(`Dashboard URL: http://localhost:${PORT}`);
    console.log(`API Base URL: http://localhost:${PORT}/api`);
    console.log('');
    console.log('Available endpoints:');
    console.log('  GET  /api/status      - Bot status and current position');
    console.log('  GET  /api/trades      - All trades from trade journal');
    console.log('  GET  /api/performance - Performance metrics');
    console.log('  GET  /api/health      - System health and errors');
    console.log('  POST /api/kill-switch - Activate kill switch');
    console.log('');
    console.log('⚠️  Read-only dashboard - Does not control bot behavior');
    console.log('Auto-refreshes every 30 seconds');
    console.log('='.repeat(60));
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});
