// ── Vasudeva Analysis Engine ───────────────────────────────────────
// 12+ Dimension Scoring: Technical, Trend, Sector, Index, F&O OI,
// PCR, IV, Liquidity, Risk, Momentum, Volatility, Breadth

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function signed(value) {
  if (value === undefined || value === null) return "0.00";
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

export function pct(value) {
  return `${value.toFixed(1)}%`;
}

/* ── 12-Dimension Score Engine ────────────────────────────────── */

const WEIGHTS = {
  technical: 0.18,
  trend: 0.16,
  sector: 0.14,
  index: 0.10,
  derivatives: 0.12,
  pcr: 0.06,
  iv: 0.04,
  liquidity: 0.06,
  risk: 0.03,
  momentum: 0.05,
  volume: 0.03,
  breadth: 0.03
};

export function scoreInstrument(instrument, strategy) {
  if (!instrument) return 0;
  let score = 0;

  const sectorScore = clamp(50 + (instrument.sectorMove || 0) * 18, 0, 100);
  const indexScore = clamp(50 + (instrument.indexMove || 0) * 18, 0, 100);
  const derivativesScore = clamp(50 + (instrument.oi || 0) * 4, 0, 100);
  const pcrScore = clamp((instrument.pcr || 1) * 55, 0, 100);
  const ivScore = clamp(100 - (instrument.iv || 30) * 1.5, 0, 100);
  const momentumScore = clamp(50 + (instrument.momentum || 0) * 10, 0, 100);
  const volumeScore = clamp((instrument.volume || 50), 0, 100);
  const breadthScore = clamp(50 + (instrument.breadth || 0) * 15, 0, 100);

  score += (instrument.technical || 50) * WEIGHTS.technical;
  score += (instrument.trend || 50) * WEIGHTS.trend;
  score += sectorScore * WEIGHTS.sector;
  score += indexScore * WEIGHTS.index;
  score += derivativesScore * WEIGHTS.derivatives;
  score += pcrScore * WEIGHTS.pcr;
  score += ivScore * WEIGHTS.iv;
  score += (instrument.liquidity || 70) * WEIGHTS.liquidity;
  score += (instrument.risk || 50) * WEIGHTS.risk;
  score += momentumScore * WEIGHTS.momentum;
  score += volumeScore * WEIGHTS.volume;
  score += breadthScore * WEIGHTS.breadth;

  // Strategy-specific boosts
  if (strategy) {
    const boosts = {
      "sector-momentum": () => (instrument.sectorMove || 0) > 0.5 ? 6 : 0,
      "oi-long-buildup": () => (instrument.oi || 0) > 3 && (instrument.change || 0) > 0 ? 7 : 0,
      "oi-short-buildup": () => (instrument.oi || 0) > 4 && (instrument.change || 0) < 0 ? 6 : 0,
      "vwap-pullback": () => (instrument.technical || 0) > 65 ? 4 : 0,
      "breakout-oi": () => (instrument.oi || 0) > 3 && (instrument.change || 0) > 1.5 ? 8 : 0,
      "iv-rank-sell": () => (instrument.iv || 0) > 35 ? 5 : 0,
      "max-pain-hedge": () => (instrument.pcr || 0) > 1.1 ? 4 : 0,
      "earnings-momentum": () => (instrument.change || 0) > 2 && (instrument.oi || 0) > 2 ? 5 : 0,
      "risk-defined-options": () => (instrument.pcr || 0) > 1 && (instrument.iv || 0) < 40 ? 4 : 0
    };
    const boostFn = boosts[strategy.id];
    if (boostFn) score += boostFn();
  }

  return Math.round(clamp(score, 0, 100));
}

/* ── Score Breakdown ──────────────────────────────────────────── */

export function scoreBreakdown(instrument) {
  if (!instrument) return [];
  return [
    ["Technical", instrument.technical || 50, "#5ed7df"],
    ["Trend", instrument.trend || 50, "#65a3ff"],
    ["Sector", clamp(50 + (instrument.sectorMove || 0) * 18, 0, 100), "#a78bfa"],
    ["Index", clamp(50 + (instrument.indexMove || 0) * 18, 0, 100), "#8b5cf6"],
    ["F&O OI", clamp(50 + (instrument.oi || 0) * 4, 0, 100), "#efba55"],
    ["PCR", clamp((instrument.pcr || 1) * 55, 0, 100), "#f59e0b"],
    ["IV", clamp(100 - (instrument.iv || 30) * 1.5, 0, 100), "#f97316"],
    ["Liquidity", instrument.liquidity || 70, "#35c987"],
    ["Momentum", clamp(50 + (instrument.momentum || 0) * 10, 0, 100), "#06b6d4"],
    ["Volume", instrument.volume || 50, "#14b8a6"],
    ["Breadth", clamp(50 + (instrument.breadth || 0) * 15, 0, 100), "#6366f1"],
    ["Risk", instrument.risk || 50, "#ef4444"]
  ];
}

export function confidenceLabel(score) {
  if (score >= 82) return { label: "🔥 High Conviction", className: "pos", emoji: "🔥" };
  if (score >= 72) return { label: "✅ Strong Setup", className: "pos", emoji: "✅" };
  if (score >= 62) return { label: "📊 Valid Setup", className: "pos", emoji: "📊" };
  if (score >= 50) return { label: "👀 Watch Only", className: "warn-text", emoji: "👀" };
  return { label: "⛔ Avoid", className: "neg", emoji: "⛔" };
}

/* ── Market Regime Detection ──────────────────────────────────── */

export function marketRegime(instruments) {
  if (!instruments || !instruments.length) return "Unknown";
  const avgChange = instruments.reduce((s, i) => s + (i.change || 0), 0) / instruments.length;
  const avgSector = instruments.reduce((s, i) => s + (i.sectorMove || 0), 0) / instruments.length;
  const avgRisk = instruments.reduce((s, i) => s + (i.risk || 50), 0) / instruments.length;
  const avgTechnical = instruments.reduce((s, i) => s + (i.technical || 50), 0) / instruments.length;
  const gainers = instruments.filter(i => (i.change || 0) > 0).length;
  const total = instruments.length;
  const breadth = gainers / total;

  if (avgChange > 0.6 && avgSector > 0.3 && breadth > 0.6)
    return { regime: "🚀 Bullish Momentum", color: "#35c987" };
  if (avgChange > 0.2 && breadth > 0.5)
    return { regime: "📈 Gradual Uptrend", color: "#5ed7df" };
  if (avgChange < -0.5 && avgSector < -0.3 && breadth < 0.35)
    return { regime: "🐻 Bearish / Risk-Off", color: "#ef4444" };
  if (avgRisk < 52 && Math.abs(avgChange) < 0.3)
    return { regime: "⚡ Choppy / Sideways", color: "#efba55" };
  if (breadth > 0.55 && avgTechnical > 60)
    return { regime: "🎯 Selective Strength", color: "#a78bfa" };
  return { regime: "🔍 Cautious / Mixed", color: "#f97316" };
}

/* ── Derivatives & F&O Intelligence ───────────────────────────── */

export function derivativesRead(instrument) {
  if (!instrument) return [];
  const oi = instrument.oi || 0;
  const pcr = instrument.pcr || 1;
  const iv = instrument.iv || 30;
  const price = instrument.price || 0;
  const change = instrument.change || 0;

  return [
    ["Futures OI Change", `${signed(oi)}%`,
     oi > 4 && change > 0 ? "🚀 Strong Long Buildup" :
     oi > 2 && change > 0 ? "📈 Long Buildup" :
     oi > 3 && change < 0 ? "📉 Short Buildup Risk" :
     oi < -2 && change > 0 ? "📊 Short Covering" :
     oi < -2 && change < 0 ? "⚠️ Long Unwinding" :
     "➖ Neutral OI"],
    ["Put-Call Ratio (PCR)", pcr.toFixed(2),
     pcr > 1.2 ? "🛡️ Strong Put Support" :
     pcr > 1 ? "✅ Put Support Visible" :
     pcr > 0.8 ? "⚠️ Call Pressure" :
     "🔴 Heavy Call Writing"],
    ["Implied Volatility", `${iv}%`,
     iv > 40 ? "💥 Premium Expensive" :
     iv > 35 ? "🔥 Elevated" :
     iv > 25 ? "📊 Normal" :
     "✅ Low / Cheap"],
    ["Max Pain (Est.)", `₹${Math.round(price * 0.99)}`,
     "🎯 Nearby Magnet Zone"],
    ["OI Support (Est.)", `₹${Math.round(price * 0.97)}`,
     "📉 Breakdown Watch"],
    ["OI Resistance (Est.)", `₹${Math.round(price * 1.03)}`,
     "📈 Breakout Watch"],
    ["Futures Premium", `${signed(change * 0.15)}%`,
     change > 0 ? "📈 Positive Carry" : "📉 Negative Carry"],
    ["India VIX Context", iv > 35 ? "Elevated" : iv > 25 ? "Normal" : "Low",
     iv > 35 ? "⚠️ Expect volatility" : "✅ Stable conditions"]
  ];
}

/* ── Scanner Tags ─────────────────────────────────────────────── */

export function scannerTag(instrument, score) {
  if (!instrument) return ["Neutral", ""];
  const oi = instrument.oi || 0;
  const change = instrument.change || 0;
  const sectorMove = instrument.sectorMove || 0;

  if (score >= 78 && change > 0 && oi > 3) return ["🚀 Strong Long", "good"];
  if (score >= 68 && change > 0 && oi > 1) return ["📈 Long Setup", "good"];
  if (score >= 62 && sectorMove > 0) return ["👀 Watch Breakout", "warn"];
  if (score >= 62 && oi > 3) return ["📊 OI Buildup", "good"];
  if (change < -1.5 && oi > 4) return ["🔴 Short Buildup", "bad"];
  if (change < -0.5 && oi > 2) return ["⚠️ Weakness", "bad"];
  if (change > 1.5 && oi < -2) return ["🔄 Short Cover", "warn"];
  return ["➖ Neutral", ""];
}

/* ── Risk Calculator ──────────────────────────────────────────── */

export function calculateRisk({ capital, riskPercent, entry, stop }) {
  const riskAmount = capital * riskPercent / 100;
  const perShareRisk = Math.abs(entry - stop);
  const quantity = perShareRisk > 0 ? Math.floor(riskAmount / perShareRisk) : 0;
  return {
    riskAmount,
    perShareRisk,
    quantity,
    maxLoss: quantity * perShareRisk,
    suggestedCapital: quantity > 0 ? Math.round(entry * quantity) : 0
  };
}

/* ── Portfolio Analytics ──────────────────────────────────────── */

export function portfolioAnalytics(positions, instruments) {
  if (!positions || !positions.length) return null;
  const priceMap = Object.fromEntries(
    (instruments || []).map(i => [i.symbol, i.price])
  );

  let totalInvested = 0;
  let totalCurrent = 0;
  let totalPnl = 0;
  let sectorExposure = {};
  let topPositions = [];

  positions.forEach(p => {
    const ltp = priceMap[p.symbol] || p.averagePrice || 0;
    const invested = Math.abs(p.quantity) * (p.averagePrice || 0);
    const current = Math.abs(p.quantity) * ltp;
    const pnl = current - invested;
    totalInvested += invested;
    totalCurrent += current;
    totalPnl += pnl;
    const sector = p.sector || "Unknown";
    sectorExposure[sector] = (sectorExposure[sector] || 0) + invested;
    topPositions.push({ ...p, ltp, pnl, invested });
  });

  const sorted = topPositions.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

  return {
    totalInvested: Math.round(totalInvested),
    totalCurrent: Math.round(totalCurrent),
    totalPnl: Math.round(totalPnl),
    pnlPercent: totalInvested > 0 ? (totalPnl / totalInvested * 100) : 0,
    sectorExposure,
    topPositions: sorted,
    positionCount: positions.length
  };
}

/* ── Technical Signal Generator ───────────────────────────────── */

export function generateTechnicalSignals(instrument) {
  if (!instrument) return [];
  const signals = [];
  const t = instrument.technical || 50;
  const trend = instrument.trend || 50;
  const mom = instrument.momentum || 0;

  if (trend > 70) signals.push({ name: "Trend", signal: "👍 Strong Uptrend", type: "bullish" });
  else if (trend < 30) signals.push({ name: "Trend", signal: "👎 Strong Downtrend", type: "bearish" });
  else signals.push({ name: "Trend", signal: "➡️ Neutral", type: "neutral" });

  if (t > 70) signals.push({ name: "RSI", signal: "📊 Overbought Zone (>70)", type: "warning" });
  else if (t < 30) signals.push({ name: "RSI", signal: "📊 Oversold Zone (<30)", type: "bullish" });
  else signals.push({ name: "RSI", signal: "📊 Neutral Zone", type: "neutral" });

  if (mom > 5) signals.push({ name: "Momentum", signal: "🚀 Strong Positive", type: "bullish" });
  else if (mom < -5) signals.push({ name: "Momentum", signal: "🔻 Strong Negative", type: "bearish" });
  else signals.push({ name: "Momentum", signal: "➡️ Flat", type: "neutral" });

  if ((instrument.volume || 50) > 70)
    signals.push({ name: "Volume", signal: "📈 Above Average", type: "bullish" });
  else if ((instrument.volume || 50) < 30)
    signals.push({ name: "Volume", signal: "📉 Below Average", type: "bearish" });

  return signals;
}
