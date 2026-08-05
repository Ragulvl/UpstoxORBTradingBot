/**
 * Dashboard JavaScript - Read-Only Monitor
 * 
 * Reads from bot's trade journal and logs
 * Auto-refreshes every 30 seconds
 * NO interaction with trading logic
 */

// Configuration
const CONFIG = {
    refreshInterval: 5000, // 5 seconds for real-time updates
    apiBaseUrl: 'http://localhost:3000/api', // Will be served by simple server
    enableAutoRefresh: true
};

// State
let equityChart = null;
let priceChart = null; // New: Real-time price chart
let allTrades = [];
let refreshTimer = null;
let previousSpotPrice = null; // Track price changes

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard initialized');
    
    // Set up event listeners
    setupEventListeners();
    
    // Initial data load
    loadDashboardData();
    
    // Start auto-refresh
    if (CONFIG.enableAutoRefresh) {
        startAutoRefresh();
    }
    
    // Initialize equity chart
    initEquityChart();
    
    // Initialize real-time price chart
    initPriceChart();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Kill switch button
    document.getElementById('kill-switch-btn').addEventListener('click', showKillSwitchModal);
    
    // Kill switch modal
    document.getElementById('confirm-kill-switch').addEventListener('click', activateKillSwitch);
    document.getElementById('cancel-kill-switch').addEventListener('click', hideKillSwitchModal);
    
    // Filters
    document.getElementById('outcome-filter').addEventListener('change', filterTrades);
    document.getElementById('exit-filter').addEventListener('change', filterTrades);
    
    // Export CSV
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
}

/**
 * Load all dashboard data
 */
async function loadDashboardData() {
    try {
        // Load data from API endpoints (served by simple server)
        const [status, trades, performance, health] = await Promise.all([
            fetch(`${CONFIG.apiBaseUrl}/status`).then(r => r.json()).catch(() => null),
            fetch(`${CONFIG.apiBaseUrl}/trades`).then(r => r.json()).catch(() => []),
            fetch(`${CONFIG.apiBaseUrl}/performance`).then(r => r.json()).catch(() => null),
            fetch(`${CONFIG.apiBaseUrl}/health`).then(r => r.json()).catch(() => null)
        ]);

        // Update UI
        updateStatusBar(status);
        updateMarketView(status); // New: Update real-time market view
        updateCurrentPosition(status?.currentPosition);
        updateRiskPanel(status?.risk, performance);
        updatePerformancePanel(performance, trades);
        updateCostAnalysis(performance, trades);
        updateTradesTable(trades);
        updateSystemHealth(health);
        updateLastUpdateTime();

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showOfflineMessage();
    }
}

/**
 * Update status bar
 */
function updateStatusBar(status) {
    if (!status) {
        document.getElementById('bot-status').textContent = 'Offline';
        document.getElementById('bot-status').className = 'value status-stopped';
        return;
    }

    // Bot status
    const botStatus = status.isRunning ? 'Running' : 'Stopped';
    const botStatusClass = status.isRunning ? 'status-running' : 'status-stopped';
    document.getElementById('bot-status').textContent = botStatus;
    document.getElementById('bot-status').className = `value ${botStatusClass}`;

    // Market session
    document.getElementById('market-session').textContent = status.sessionState || 'Unknown';

    // Next event
    if (status.nextEvent) {
        const minutes = status.nextEvent.minutes;
        const event = status.nextEvent.event;
        document.getElementById('next-event').textContent = 
            `${event} in ${minutes}m`;
    }
}

/**
 * Update current position panel
 */
function updateCurrentPosition(position) {
    const panel = document.getElementById('position-panel');
    
    if (!position) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    
    document.getElementById('pos-instrument').textContent = position.instrument || '-';
    document.getElementById('pos-direction').textContent = position.side || '-';
    document.getElementById('pos-entry').textContent = `₹${position.entryPrice?.toFixed(2) || '-'}`;
    document.getElementById('pos-current').textContent = `₹${position.currentPrice?.toFixed(2) || '-'}`;
    
    const pnl = position.pnl || 0;
    const pnlElement = document.getElementById('pos-pnl');
    pnlElement.textContent = `₹${pnl.toFixed(2)}`;
    pnlElement.className = pnl >= 0 ? 'value trade-win' : 'value trade-loss';
    
    const duration = calculateDuration(position.entryTime);
    document.getElementById('pos-duration').textContent = duration;
}

/**
 * Update risk & safety panel
 */
function updateRiskPanel(risk, performance) {
    if (!risk) return;

    // Daily loss limit
    const dailyPnL = performance?.dailyPnL || 0;
    const capital = risk.capital || 100000;
    const dailyLossLimit = risk.dailyLossLimit || 2000;
    const dailyLossPercent = (Math.abs(dailyPnL) / capital) * 100;
    
    document.getElementById('daily-loss-value').textContent = 
        `₹${dailyPnL.toFixed(0)} / ₹${dailyLossLimit.toFixed(0)} (${dailyLossPercent.toFixed(1)}%)`;
    
    const lossProgress = Math.min((Math.abs(dailyPnL) / dailyLossLimit) * 100, 100);
    const lossProgressEl = document.getElementById('daily-loss-progress');
    lossProgressEl.style.width = `${lossProgress}%`;
    lossProgressEl.className = 'progress-fill';
    if (lossProgress > 80) lossProgressEl.classList.add('danger');
    else if (lossProgress > 50) lossProgressEl.classList.add('warning');

    // Trades count
    const tradesCount = risk.tradesCount || 0;
    const maxTrades = risk.maxTradesPerDay || 2;
    
    document.getElementById('trades-count-value').textContent = 
        `${tradesCount} / ${maxTrades}`;
    
    const tradesProgress = (tradesCount / maxTrades) * 100;
    const tradesProgressEl = document.getElementById('trades-count-progress');
    tradesProgressEl.style.width = `${tradesProgress}%`;
    tradesProgressEl.className = 'progress-fill';
    if (tradesProgress >= 100) tradesProgressEl.classList.add('warning');

    // Circuit breaker
    const cbElement = document.getElementById('circuit-breaker');
    if (risk.circuitBreakerTriggered) {
        cbElement.textContent = 'TRIGGERED';
        cbElement.className = 'status-danger';
    } else {
        cbElement.textContent = 'ARMED';
        cbElement.className = 'status-ok';
    }
}

/**
 * Update performance summary
 */
function updatePerformancePanel(performance, trades) {
    if (!performance) return;

    // Total trades
    document.getElementById('total-trades').textContent = performance.totalTrades || 0;
    document.getElementById('total-wins').textContent = performance.wins || 0;
    document.getElementById('total-losses').textContent = performance.losses || 0;

    // Win rates
    document.getElementById('win-rate-raw').textContent = 
        `${(performance.rawWinRate || 0).toFixed(1)}%`;
    document.getElementById('win-rate-adjusted').textContent = 
        `${(performance.adjustedWinRate || 0).toFixed(1)}%`;

    // Profit factors
    document.getElementById('profit-factor-raw').textContent = 
        (performance.rawProfitFactor || 0).toFixed(2);
    document.getElementById('profit-factor-adjusted').textContent = 
        (performance.adjustedProfitFactor || 0).toFixed(2);

    // P&L
    const rawPnL = performance.totalRawPnL || 0;
    const adjPnL = performance.totalAdjustedPnL || 0;
    
    const rawPnLEl = document.getElementById('pnl-raw');
    rawPnLEl.textContent = `₹${rawPnL.toFixed(0)}`;
    rawPnLEl.className = rawPnL >= 0 ? 'metric-value trade-win' : 'metric-value trade-loss';
    
    const adjPnLEl = document.getElementById('pnl-adjusted');
    adjPnLEl.textContent = `₹${adjPnL.toFixed(0)}`;
    adjPnLEl.className = adjPnL >= 0 ? 'metric-value trade-win' : 'metric-value trade-loss';

    // Update equity chart
    updateEquityChart(trades);
}

/**
 * Initialize equity chart
 */
function initEquityChart() {
    const ctx = document.getElementById('equity-chart').getContext('2d');
    
    equityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Raw P&L',
                    data: [],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    tension: 0.4
                },
                {
                    label: 'Cost-Adjusted P&L',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => `₹${value}`
                    }
                }
            }
        }
    });
}

/**
 * Update equity chart
 */
function updateEquityChart(trades) {
    if (!equityChart || !trades || trades.length === 0) return;

    let cumulativeRaw = 0;
    let cumulativeAdjusted = 0;

    const labels = [];
    const rawData = [];
    const adjustedData = [];

    trades.forEach((trade, index) => {
        cumulativeRaw += trade.pnl?.raw || 0;
        cumulativeAdjusted += trade.pnl?.adjusted || 0;

        labels.push(`Trade ${index + 1}`);
        rawData.push(cumulativeRaw);
        adjustedData.push(cumulativeAdjusted);
    });

    equityChart.data.labels = labels;
    equityChart.data.datasets[0].data = rawData;
    equityChart.data.datasets[1].data = adjustedData;
    equityChart.update();
}

/**
 * Update cost analysis panel
 */
function updateCostAnalysis(performance, trades) {
    if (!performance) return;

    // Average cost percent
    const avgCostPercent = performance.averageCostPercent || 0;
    document.getElementById('avg-cost-percent').textContent = `${avgCostPercent.toFixed(1)}%`;

    // Total costs
    const totalCosts = performance.totalCosts || 0;
    document.getElementById('total-costs').textContent = `₹${totalCosts.toFixed(0)}`;

    // Trades erased by costs
    const tradesErased = performance.tradesErasedByCosts || 0;
    document.getElementById('trades-erased').textContent = tradesErased;

    // Profit factor indicator
    const adjustedPF = performance.adjustedProfitFactor || 0;
    updateProfitFactorIndicator(adjustedPF, performance.totalTrades || 0);
}

/**
 * Update profit factor indicator
 */
function updateProfitFactorIndicator(pf, totalTrades) {
    const indicator = document.getElementById('pf-indicator');
    const message = document.getElementById('verdict-message');

    // Calculate position (0-100%)
    let position;
    if (pf < 1.0) {
        position = (pf / 1.0) * 33.33; // 0-33%
    } else if (pf < 1.2) {
        position = 33.33 + ((pf - 1.0) / 0.2) * 33.33; // 33-66%
    } else {
        position = 66.66 + Math.min(((pf - 1.2) / 0.8) * 33.34, 33.34); // 66-100%
    }

    indicator.style.left = `${position}%`;

    // Update message
    if (totalTrades < 30) {
        message.textContent = `Collecting data... ${totalTrades}/30 trades minimum`;
        message.className = 'verdict-message';
    } else if (pf > 1.2) {
        message.textContent = `✅ PASS - Edge survives costs (PF: ${pf.toFixed(2)})`;
        message.className = 'verdict-message pass';
    } else if (pf >= 1.0) {
        message.textContent = `⚠️ MARGINAL - Thin edge (PF: ${pf.toFixed(2)})`;
        message.className = 'verdict-message marginal';
    } else {
        message.textContent = `❌ FAIL - Costs erase edge (PF: ${pf.toFixed(2)})`;
        message.className = 'verdict-message fail';
    }
}

/**
 * Update trades table
 */
function updateTradesTable(trades) {
    if (!trades || trades.length === 0) return;

    allTrades = trades;
    filterTrades();
}

/**
 * Filter and display trades
 */
function filterTrades() {
    const outcomeFilter = document.getElementById('outcome-filter').value;
    const exitFilter = document.getElementById('exit-filter').value;

    let filtered = allTrades;

    if (outcomeFilter !== 'all') {
        filtered = filtered.filter(t => t.outcome === outcomeFilter);
    }

    if (exitFilter !== 'all') {
        filtered = filtered.filter(t => t.exit?.reason === exitFilter);
    }

    renderTradesTable(filtered);
}

/**
 * Render trades table
 */
function renderTradesTable(trades) {
    const tbody = document.getElementById('trades-tbody');

    if (trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="no-data">No trades match the filter</td></tr>';
        return;
    }

    tbody.innerHTML = trades.map(trade => {
        const rawPnL = trade.pnl?.raw || 0;
        const adjPnL = trade.pnl?.adjusted || 0;
        const costs = trade.pnl?.difference || 0;

        return `
            <tr>
                <td>${formatDate(trade.entry?.time)}</td>
                <td>${formatTime(trade.entry?.time)}</td>
                <td>${trade.instrument || '-'}</td>
                <td>${trade.entry?.side || '-'}</td>
                <td>₹${(trade.entry?.fillPrice || 0).toFixed(2)}</td>
                <td>₹${(trade.exit?.fillPrice || 0).toFixed(2)}</td>
                <td>${trade.exit?.reason || '-'}</td>
                <td>${trade.durationMinutes || 0}m</td>
                <td class="${rawPnL >= 0 ? 'trade-win' : 'trade-loss'}">₹${rawPnL.toFixed(2)}</td>
                <td>₹${costs.toFixed(2)}</td>
                <td class="${adjPnL >= 0 ? 'trade-win' : 'trade-loss'}">₹${adjPnL.toFixed(2)}</td>
                <td class="${trade.outcome === 'WIN' ? 'trade-win' : 'trade-loss'}">${trade.outcome}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Update system health
 */
function updateSystemHealth(health) {
    if (!health) return;

    // WebSocket status
    const wsStatus = health.wsConnected ? 'Connected' : 'Disconnected';
    const wsClass = health.wsConnected ? 'status-ok' : 'status-danger';
    document.getElementById('ws-status').textContent = wsStatus;
    document.getElementById('ws-status').className = wsClass;

    // Last data timestamp
    if (health.lastDataUpdate) {
        document.getElementById('data-timestamp').textContent = 
            formatTimestamp(health.lastDataUpdate);
    }

    // Candles count
    document.getElementById('candles-count').textContent = health.candlesCount || 0;

    // Error log
    renderErrorLog(health.errors || []);
}

/**
 * Render error log
 */
function renderErrorLog(errors) {
    const logContainer = document.getElementById('error-log');

    if (errors.length === 0) {
        logContainer.innerHTML = '<div class="log-entry">No errors or warnings</div>';
        return;
    }

    logContainer.innerHTML = errors.slice(-10).reverse().map(error => `
        <div class="log-entry ${error.level === 'error' ? 'log-error' : 'log-warning'}">
            [${formatTimestamp(error.timestamp)}] ${error.message}
        </div>
    `).join('');
}

/**
 * Show kill switch modal
 */
function showKillSwitchModal() {
    document.getElementById('kill-switch-modal').style.display = 'flex';
}

/**
 * Hide kill switch modal
 */
function hideKillSwitchModal() {
    document.getElementById('kill-switch-modal').style.display = 'none';
}

/**
 * Activate kill switch
 */
async function activateKillSwitch() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/kill-switch`, {
            method: 'POST'
        });

        if (response.ok) {
            alert('✅ Kill switch activated! Bot will stop after closing open positions.');
            hideKillSwitchModal();
            loadDashboardData();
        } else {
            alert('❌ Failed to activate kill switch. Check logs.');
        }
    } catch (error) {
        alert('❌ Error activating kill switch: ' + error.message);
    }
}

/**
 * Export trades to CSV
 */
function exportToCSV() {
    if (allTrades.length === 0) {
        alert('No trades to export');
        return;
    }

    const headers = ['Date', 'Time', 'Instrument', 'Direction', 'Entry', 'Exit', 'Exit Reason', 
                     'Duration', 'Raw P&L', 'Costs', 'Adj P&L', 'Outcome'];
    
    const rows = allTrades.map(trade => [
        formatDate(trade.entry?.time),
        formatTime(trade.entry?.time),
        trade.instrument || '-',
        trade.entry?.side || '-',
        (trade.entry?.fillPrice || 0).toFixed(2),
        (trade.exit?.fillPrice || 0).toFixed(2),
        trade.exit?.reason || '-',
        `${trade.durationMinutes || 0}`,
        (trade.pnl?.raw || 0).toFixed(2),
        (trade.pnl?.difference || 0).toFixed(2),
        (trade.pnl?.adjusted || 0).toFixed(2),
        trade.outcome
    ]);

    const csv = [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Start auto-refresh
 */
function startAutoRefresh() {
    refreshTimer = setInterval(() => {
        loadDashboardData();
    }, CONFIG.refreshInterval);
}

/**
 * Stop auto-refresh
 */
function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

/**
 * Update last update time
 */
function updateLastUpdateTime() {
    document.getElementById('last-update').textContent = 
        new Date().toLocaleTimeString('en-IN');
}

/**
 * Show offline message
 */
function showOfflineMessage() {
    document.getElementById('bot-status').textContent = 'Offline';
    document.getElementById('bot-status').className = 'value status-stopped';
}

/**
 * Utility functions
 */

function formatDate(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('en-IN');
}

function formatTime(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN');
}

function calculateDuration(startTime) {
    if (!startTime) return '-';
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 1000 / 60);
    
    if (diffMins < 60) {
        return `${diffMins}m`;
    } else {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h ${mins}m`;
    }
}


/**
 * Initialize real-time price chart
 */
function initPriceChart() {
    const ctx = document.getElementById('price-chart').getContext('2d');
    
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'NIFTY Spot Price',
                    data: [],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    tension: 0.1,
                    fill: true,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `Price: ₹${context.parsed.y.toFixed(2)}`;
                        }
                    }
                },
                annotation: {
                    annotations: {}
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Price (₹)'
                    },
                    ticks: {
                        callback: (value) => `₹${value.toFixed(0)}`
                    }
                }
            }
        }
    });
}

/**
 * Update price chart with real-time data
 */
function updatePriceChart(candles, openingRange, goldenRatioLevels) {
    if (!priceChart || !candles || candles.length === 0) return;

    const labels = candles.map(c => {
        const date = new Date(c.timestamp);
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    });
    
    const prices = candles.map(c => c.close);

    priceChart.data.labels = labels;
    priceChart.data.datasets[0].data = prices;

    // Add Opening Range lines if available
    if (openingRange) {
        priceChart.options.plugins.annotation = {
            annotations: {
                orHigh: {
                    type: 'line',
                    yMin: openingRange.high,
                    yMax: openingRange.high,
                    borderColor: '#10b981',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    label: {
                        content: `OR High: ${openingRange.high.toFixed(2)}`,
                        enabled: true,
                        position: 'end'
                    }
                },
                orLow: {
                    type: 'line',
                    yMin: openingRange.low,
                    yMax: openingRange.low,
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    label: {
                        content: `OR Low: ${openingRange.low.toFixed(2)}`,
                        enabled: true,
                        position: 'end'
                    }
                }
            }
        };

        // Add Golden Ratio breakout levels if available
        if (goldenRatioLevels) {
            priceChart.options.plugins.annotation.annotations.grLong = {
                type: 'line',
                yMin: goldenRatioLevels.longEntry,
                yMax: goldenRatioLevels.longEntry,
                borderColor: '#8b5cf6',
                borderWidth: 2,
                borderDash: [10, 5],
                label: {
                    content: `📈 CALL: ${goldenRatioLevels.longEntry.toFixed(2)}`,
                    enabled: true,
                    position: 'start',
                    backgroundColor: '#8b5cf6'
                }
            };

            priceChart.options.plugins.annotation.annotations.grShort = {
                type: 'line',
                yMin: goldenRatioLevels.shortEntry,
                yMax: goldenRatioLevels.shortEntry,
                borderColor: '#f97316',
                borderWidth: 2,
                borderDash: [10, 5],
                label: {
                    content: `📉 PUT: ${goldenRatioLevels.shortEntry.toFixed(2)}`,
                    enabled: true,
                    position: 'start',
                    backgroundColor: '#f97316'
                }
            };
        }
    }

    priceChart.update('none'); // Update without animation for smoother real-time updates
}

/**
 * Update real-time market view
 */
function updateMarketView(status) {
    if (!status) return;

    // Update spot price
    const spotPrice = status.spotPrice;
    if (spotPrice) {
        const formattedPrice = new Intl.NumberFormat('en-IN').format(spotPrice.toFixed(2));
        document.getElementById('spot-price').textContent = formattedPrice;

        // Calculate and show price change
        if (previousSpotPrice !== null) {
            const change = spotPrice - previousSpotPrice;
            const changePercent = (change / previousSpotPrice) * 100;
            const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
            
            const changeElement = document.getElementById('spot-change');
            changeElement.textContent = changeText;
            changeElement.className = change >= 0 ? 'spot-change positive' : 'spot-change negative';
        }

        previousSpotPrice = spotPrice;
    }

    // Update data source indicator
    const wsConnected = status.wsConnected || false;
    const wsIndicator = document.getElementById('ws-indicator');
    const sourceText = document.getElementById('source-text');

    if (wsConnected) {
        wsIndicator.className = 'indicator-dot ws-connected';
        sourceText.textContent = '🟢 Live - WebSocket Connected';
        sourceText.style.color = '#10b981';
    } else {
        wsIndicator.className = 'indicator-dot rest-api';
        sourceText.textContent = '🟡 REST API Fallback';
        sourceText.style.color = '#f59e0b';
    }

    // Update last tick time
    document.getElementById('last-tick-time').textContent = new Date().toLocaleTimeString('en-IN');

    // Update price chart with recent candles
    if (status.recentCandles && status.recentCandles.length > 0) {
        updatePriceChart(status.recentCandles, status.openingRange, status.goldenRatioLevels);
    }

    // Update Opening Range display
    if (status.openingRange) {
        document.getElementById('or-display').style.display = 'block';
        document.getElementById('or-high').textContent = `₹${status.openingRange.high.toFixed(2)}`;
        document.getElementById('or-low').textContent = `₹${status.openingRange.low.toFixed(2)}`;
        document.getElementById('or-range').textContent = `₹${status.openingRange.range.toFixed(2)}`;
    }

    // Update Golden Ratio levels display
    if (status.goldenRatioLevels) {
        document.getElementById('gr-long').textContent = `₹${status.goldenRatioLevels.longEntry.toFixed(2)}`;
        document.getElementById('gr-short').textContent = `₹${status.goldenRatioLevels.shortEntry.toFixed(2)}`;
    }
}
