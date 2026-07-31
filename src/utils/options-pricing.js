/**
 * Simplified Options Pricing Utilities
 * 
 * Note: This uses simplified Black-Scholes approximation for backtesting.
 * For live trading, fetch actual option prices from Upstox Option Chain API.
 */

/**
 * Simplified Black-Scholes approximation for option premium
 * This is for backtesting purposes - real prices will vary
 */
export function estimateOptionPremium(spot, strike, timeToExpiry, volatility, optionType) {
  // Simplified approximation - not accurate for real trading
  // In production, use actual option chain prices from Upstox
  
  const moneyness = optionType === 'CALL' 
    ? (spot - strike) / strike 
    : (strike - spot) / strike;
  
  // ATM options typically trade at ~1-2% of spot
  // ITM adds intrinsic value, OTM reduces premium
  let premium;
  
  if (Math.abs(moneyness) < 0.005) {
    // ATM
    premium = spot * 0.015 * Math.sqrt(timeToExpiry);
  } else if (moneyness > 0) {
    // ITM
    const intrinsic = Math.abs(spot - strike);
    const timeValue = spot * 0.01 * Math.sqrt(timeToExpiry);
    premium = intrinsic + timeValue;
  } else {
    // OTM
    premium = spot * 0.005 * Math.sqrt(timeToExpiry) * Math.exp(moneyness * 5);
  }
  
  // Adjust for volatility
  premium *= (1 + volatility / 100);
  
  return Math.max(premium, spot * 0.001); // Minimum 0.1% of spot
}

/**
 * Calculate option strike based on spot price
 * Options typically available in fixed strike intervals
 */
export function getOptionStrike(spot, instrument) {
  const strikeInterval = instrument === 'NIFTY' ? 50 : 100;
  
  // Round to nearest strike
  const nearestStrike = Math.round(spot / strikeInterval) * strikeInterval;
  
  return nearestStrike;
}

/**
 * Calculate option P&L based on entry and exit premiums
 */
export function calculateOptionPnL(entryPremium, exitPremium, quantity) {
  const pnlPerUnit = exitPremium - entryPremium;
  const totalPnL = pnlPerUnit * quantity;
  const pnlPercent = (pnlPerUnit / entryPremium) * 100;
  
  return {
    pnlPerUnit,
    totalPnL,
    pnlPercent
  };
}

/**
 * Calculate position size for options based on risk per trade
 */
export function calculateOptionsPositionSize(capital, riskPerTradePercent, optionPremium, stopLossPercent) {
  const riskAmount = capital * (riskPerTradePercent / 100);
  const premiumAtRisk = optionPremium * (stopLossPercent / 100);
  
  // If SL hits, we lose stopLossPercent of premium paid
  // So quantity = risk amount / loss per option at SL
  const quantity = Math.floor(riskAmount / (optionPremium * stopLossPercent / 100));
  
  // Cap quantity to not exceed total capital
  const maxQuantity = Math.floor(capital / optionPremium);
  
  return Math.min(quantity, maxQuantity);
}

/**
 * Estimate option premium change based on spot price change
 * Simplified delta approximation for backtesting
 */
export function estimatePremiumChange(entrySpot, currentSpot, entryPremium, optionType, timeDecay = 0) {
  const spotChange = currentSpot - entrySpot;
  const spotChangePercent = (spotChange / entrySpot) * 100;
  
  // Simplified delta estimation
  // ATM options ~0.5 delta, adjusts based on moneyness
  let delta;
  if (optionType === 'CALL') {
    delta = 0.5 + (spotChangePercent / 10); // Rough approximation
    delta = Math.max(0, Math.min(1, delta));
  } else {
    delta = -0.5 + (spotChangePercent / 10);
    delta = Math.max(-1, Math.min(0, delta));
  }
  
  const premiumChange = spotChange * Math.abs(delta);
  const currentPremium = entryPremium + premiumChange - timeDecay;
  
  // Option can't go below 0
  return Math.max(currentPremium, 0);
}

/**
 * Calculate time decay for option premium
 * Options lose value as they approach expiry
 */
export function calculateTimeDecay(premium, daysToExpiry, hoursElapsed) {
  // Theta decay - accelerates near expiry
  const dailyDecay = premium * 0.05; // ~5% per day (rough approximation)
  const hourlyDecay = dailyDecay / 6.25; // Trading hours per day
  
  return hourlyDecay * hoursElapsed;
}

/**
 * Get days to nearest expiry
 * Nifty: Thursday weekly, BankNifty: Wednesday weekly
 */
export function getDaysToExpiry(date, instrument) {
  const dayOfWeek = date.getDay();
  
  let daysToExpiry;
  if (instrument === 'NIFTY') {
    // Thursday expiry
    daysToExpiry = dayOfWeek <= 4 ? 4 - dayOfWeek : 7 - dayOfWeek + 4;
  } else if (instrument === 'BANKNIFTY') {
    // Wednesday expiry
    daysToExpiry = dayOfWeek <= 3 ? 3 - dayOfWeek : 7 - dayOfWeek + 3;
  } else {
    daysToExpiry = 7; // Default weekly
  }
  
  return Math.max(daysToExpiry, 0.1); // Minimum 0.1 day
}

export default {
  estimateOptionPremium,
  getOptionStrike,
  calculateOptionPnL,
  calculateOptionsPositionSize,
  estimatePremiumChange,
  calculateTimeDecay,
  getDaysToExpiry
};
