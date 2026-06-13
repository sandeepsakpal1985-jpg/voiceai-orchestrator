export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function signed(value) {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

export function scoreInstrument(instrument, strategy) {
  let score = 0;
  const sectorScore = clamp(50 + instrument.sectorMove * 18, 0, 100);
  const indexScore = clamp(50 + instrument.indexMove * 18, 0, 100);
  const derivativesScore = clamp(50 + instrument.oi * 4, 0, 100);
  const pcrScore = clamp(instrument.pcr * 55, 0, 100);

  score += instrument.technical * 0.24;
  score += instrument.trend * 0.20;
  score += sectorScore * 0.16;
  score += indexScore * 0.10;
  score += derivativesScore * 0.14;
  score += pcrScore * 0.08;
  score += instrument.liquidity * 0.05;
  score += instrument.risk * 0.03;

  if (strategy.boost === "sector" && instrument.sectorMove > 0.5) score += 4;
  if (strategy.boost === "fo" && instrument.oi > 3 && instrument.change > 0) score += 5;
  if (strategy.boost === "technical" && instrument.technical > 70) score += 3;
  if (strategy.boost === "options" && instrument.pcr > 1 && instrument.iv < 40) score += 3;

  return Math.round(clamp(score, 0, 100));
}

export function scoreBreakdown(instrument) {
  return [
    ["Stock TA", instrument.technical, "#5ed7df"],
    ["Trend", instrument.trend, "#65a3ff"],
    ["Sector", clamp(50 + instrument.sectorMove * 18, 0, 100), "#a78bfa"],
    ["F&O", clamp(50 + instrument.oi * 4, 0, 100), "#efba55"],
    ["Risk", instrument.risk, "#35c987"]
  ];
}

export function confidenceLabel(score) {
  if (score >= 78) return { label: "High Conviction", className: "pos" };
  if (score >= 62) return { label: "Valid Setup", className: "pos" };
  if (score >= 50) return { label: "Watch Only", className: "warn-text" };
  return { label: "Avoid", className: "neg" };
}

export function marketRegime(instruments) {
  const averageChange = instruments.reduce((sum, item) => sum + item.change, 0) / instruments.length;
  const averageSector = instruments.reduce((sum, item) => sum + item.sectorMove, 0) / instruments.length;
  const averageRisk = instruments.reduce((sum, item) => sum + item.risk, 0) / instruments.length;

  if (averageChange > 0.6 && averageSector > 0.4 && averageRisk > 60) return "Risk-on trend";
  if (averageChange < -0.5 && averageSector < -0.3) return "Risk-off";
  if (averageRisk < 52) return "Choppy";
  return "Selective";
}

export function derivativesRead(instrument) {
  return [
    ["Futures OI", `${signed(instrument.oi)}%`, instrument.oi > 3 && instrument.change > 0 ? "Long buildup" : instrument.oi > 3 ? "Short buildup risk" : "Neutral"],
    ["PCR", instrument.pcr.toFixed(2), instrument.pcr > 1 ? "Put support visible" : "Call pressure visible"],
    ["IV", `${instrument.iv}%`, instrument.iv > 35 ? "Premium rich" : "Normal volatility"],
    ["OI Support", `₹${Math.round(instrument.price * 0.97)}`, "Watch breakdown"],
    ["OI Resistance", `₹${Math.round(instrument.price * 1.03)}`, "Watch breakout"]
  ];
}

export function scannerTag(instrument, score) {
  if (score >= 75 && instrument.change > 0 && instrument.oi > 3) return ["Long Setup", "good"];
  if (score >= 62 && instrument.sectorMove > 0) return ["Watch Breakout", "warn"];
  if (instrument.change < 0 && instrument.oi > 3) return ["Short Buildup Risk", "bad"];
  return ["Neutral", ""];
}

export function calculateRisk({ capital, riskPercent, entry, stop }) {
  const riskAmount = capital * riskPercent / 100;
  const perShareRisk = Math.abs(entry - stop);
  const quantity = perShareRisk > 0 ? Math.floor(riskAmount / perShareRisk) : 0;
  return { riskAmount, perShareRisk, quantity, maxLoss: quantity * perShareRisk };
}
