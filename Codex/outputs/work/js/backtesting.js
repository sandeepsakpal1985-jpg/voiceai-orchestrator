// ── Vasudeva Backtesting Engine ─────────────────────────────────
// Simulate strategy performance with historical data and generate
// performance metrics including Sharpe, max drawdown, win rate

import { scoreInstrument, clamp } from "./analysisEngine.js";
import { instruments as defaultInstruments } from "./mockData.js";

export function generateHistoricalData(instrument, days = 200) {
  const data = [];
  const basePrice = instrument?.price || 1000;
  const volatility = (instrument?.iv || 30) / 100 * 0.5;

  let price = basePrice * 0.85; // Start lower
  let oi = (instrument?.oi || 5) * -1;

  for (let i = 0; i < days; i++) {
    const drift = (Math.random() - 0.48) * volatility * price * 0.02;
    const momentumFactor = i > 50 ? 0.01 : 0;
    price = Math.max(10, price + drift + price * momentumFactor * Math.sin(i * 0.05));
    oi = clamp(oi + (Math.random() - 0.5) * 2, -8, 12);

    data.push({
      day: i + 1,
      price: Math.round(price * 100) / 100,
      oi: Math.round(oi * 10) / 10,
      technical: Math.round(45 + Math.sin(i * 0.08) * 25 + Math.random() * 10),
      trend: Math.round(50 + Math.sin(i * 0.06) * 20 + Math.random() * 8),
      volume: Math.round(40 + Math.sin(i * 0.1) * 20 + Math.random() * 20),
      change: (Math.random() - 0.48) * 3,
      sectorMove: Math.sin(i * 0.04) * 1.5 + (Math.random() - 0.5) * 0.5,
      pcr: 0.8 + Math.sin(i * 0.05) * 0.3 + Math.random() * 0.1,
      momentum: Math.sin(i * 0.07) * 8 + (Math.random() - 0.5) * 3,
      liquidity: 60 + Math.random() * 30,
      risk: 40 + Math.random() * 30
    });
  }

  return data;
}

export function runBacktest(data, strategy, options = {}) {
  if (!data || !data.length) return null;

  const {
    initialCapital = 250000,
    positionSize = 0.25, // 25% per trade
    stopLoss = 0.025, // 2.5%
    targetProfit = 0.05, // 5%
    maxPositions = 3
  } = options;

  let capital = initialCapital;
  let peakCapital = initialCapital;
  let openPositions = [];
  let trades = [];
  const equityCurve = [{ day: 0, capital: initialCapital }];
  let wins = 0, losses = 0;

  for (let i = 20; i < data.length; i++) {
    // Only trade from day 20 onwards (need SMA)
    const day = data[i];

    // Check exits
    const toClose = [];
    openPositions = openPositions.filter(pos => {
      const holdingDays = i - pos.entryDay;
      const returnPct = (day.price - pos.entryPrice) / pos.entryPrice;

      // Stop loss hit
      if (returnPct <= -stopLoss) {
        const loss = pos.capital * (returnPct + 1) - pos.capital;
        capital += pos.capital + loss;
        trades.push({ type: "loss", entry: pos.entryPrice, exit: day.price, return: returnPct * 100, days: holdingDays });
        losses++;
        return false;
      }

      // Target hit
      if (returnPct >= targetProfit) {
        const profit = pos.capital * (returnPct + 1) - pos.capital;
        capital += pos.capital + profit;
        trades.push({ type: "win", entry: pos.entryPrice, exit: day.price, return: returnPct * 100, days: holdingDays });
        wins++;
        return false;
      }

      // Max holding period
      if (holdingDays > 20) {
        capital += pos.capital * (1 + returnPct * 0.5);
        trades.push({ type: "timeout", entry: pos.entryPrice, exit: day.price, return: returnPct * 50, days: holdingDays });
        return false;
      }

      return true;
    });

    // Check entry
    if (openPositions.length < maxPositions) {
      const mockInstrument = { ...day };
      const score = scoreInstrument(mockInstrument, strategy);

      if (score >= 65 && day.trend > 55 && openPositions.length < maxPositions) {
        const posCapital = capital * positionSize;
        const qty = Math.floor(posCapital / day.price);

        if (qty > 0 && posCapital > 0) {
          openPositions.push({
            entryDay: i,
            entryPrice: day.price,
            quantity: qty,
            capital: posCapital,
            symbol: "BT",
            entryScore: score
          });
          capital -= posCapital;
        }
      }
    }

    // Track equity (capital + open position value)
    let equity = capital;
    openPositions.forEach(pos => {
      const currentValue = pos.quantity * day.price;
      equity += Math.max(0, currentValue);
    });

    if (equity > peakCapital) peakCapital = equity;
    equityCurve.push({ day: i, capital: Math.round(equity) });
  }

  // Force close remaining positions at last price
  const lastDay = data[data.length - 1];
  openPositions.forEach(pos => {
    const returnPct = (lastDay.price - pos.entryPrice) / pos.entryPrice;
    capital += pos.capital * (1 + returnPct * 0.5);
    trades.push({ type: "end", entry: pos.entryPrice, exit: lastDay.price, return: returnPct * 50, days: data.length - pos.entryDay });
  });

  // Calculate metrics
  const totalReturn = (capital - initialCapital) / initialCapital * 100;
  const maxDrawdown = calculateMaxDrawdown(equityCurve);
  const winRate = trades.length > 0 ? wins / (wins + losses) * 100 : 0;
  const avgReturn = trades.length > 0 ? trades.reduce((s, t) => s + t.return, 0) / trades.length : 0;
  const sharpe = calculateSharpe(equityCurve);

  return {
    initialCapital,
    finalCapital: Math.round(capital),
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalTrades: trades.length,
    wins,
    losses,
    winRate: Math.round(winRate * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    avgReturn: Math.round(avgReturn * 100) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
    equityCurve,
    trades: trades.slice(-20) // Last 20 trades
  };
}

function calculateMaxDrawdown(equityCurve) {
  let peak = equityCurve[0]?.capital || 0;
  let maxDD = 0;

  equityCurve.forEach(point => {
    if (point.capital > peak) peak = point.capital;
    const dd = (peak - point.capital) / peak;
    if (dd > maxDD) maxDD = dd;
  });

  return maxDD;
}

function calculateSharpe(equityCurve) {
  if (equityCurve.length < 2) return 0;
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const ret = (equityCurve[i].capital - equityCurve[i - 1].capital) / equityCurve[i - 1].capital;
    returns.push(ret);
  }
  const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - avg) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance) || 1;
  const dailySharpe = avg / std;
  return dailySharpe * Math.sqrt(252); // Annualized
}
