// ── Vasudeva Data Store ─────────────────────────────────────────
// Extended instrument universe with 15 stocks + 8 strategies + integrations

export const instruments = [
  { symbol: "TATAMOTORS",  sector: "Auto",    price: 986.4,  change: 1.82, sectorMove: 1.18, indexMove: 0.62, oi: 7.6,  pcr: 1.21, iv: 38, trend: 82, technical: 78, liquidity: 88, risk: 67, momentum: 8.2, volume: 74, breadth: 5.6 },
  { symbol: "RELIANCE",    sector: "Energy",  price: 2914.2, change: -0.42, sectorMove: -0.16, indexMove: 0.62, oi: -2.1, pcr: 0.88, iv: 29, trend: 48, technical: 52, liquidity: 94, risk: 54, momentum: -2.4, volume: 82, breadth: -1.8 },
  { symbol: "HDFCBANK",    sector: "Banking", price: 1688.7, change: 0.68, sectorMove: 0.74, indexMove: 0.62, oi: 3.4,  pcr: 1.05, iv: 24, trend: 66, technical: 69, liquidity: 96, risk: 72, momentum: 4.1, volume: 78, breadth: 3.2 },
  { symbol: "INFY",        sector: "IT",      price: 1526.9, change: -1.12, sectorMove: -1.48, indexMove: 0.62, oi: 5.1,  pcr: 0.72, iv: 32, trend: 39, technical: 44, liquidity: 86, risk: 46, momentum: -6.8, volume: 65, breadth: -2.4 },
  { symbol: "LT",          sector: "Infra",   price: 3678.3, change: 1.04, sectorMove: 0.82, indexMove: 0.62, oi: 4.8,  pcr: 1.14, iv: 27, trend: 76, technical: 73, liquidity: 82, risk: 70, momentum: 5.6, volume: 71, breadth: 4.2 },
  { symbol: "TCS",         sector: "IT",      price: 3892.5, change: -0.68, sectorMove: -1.48, indexMove: 0.62, oi: -1.2, pcr: 0.85, iv: 26, trend: 55, technical: 58, liquidity: 90, risk: 52, momentum: -3.2, volume: 68, breadth: -1.2 },
  { symbol: "SBIN",        sector: "Banking", price: 842.3,  change: 1.24, sectorMove: 0.74, indexMove: 0.62, oi: 6.2,  pcr: 1.18, iv: 35, trend: 72, technical: 76, liquidity: 84, risk: 62, momentum: 7.4, volume: 88, breadth: 5.1 },
  { symbol: "BAJFINANCE",  sector: "Finance", price: 7124.8, change: 0.82, sectorMove: 0.56, indexMove: 0.62, oi: 2.8,  pcr: 1.02, iv: 31, trend: 64, technical: 68, liquidity: 78, risk: 58, momentum: 3.8, volume: 62, breadth: 2.6 },
  { symbol: "ICICIBANK",   sector: "Banking", price: 1246.9, change: 0.92, sectorMove: 0.74, indexMove: 0.62, oi: 4.5,  pcr: 1.08, iv: 28, trend: 71, technical: 74, liquidity: 92, risk: 68, momentum: 5.2, volume: 76, breadth: 3.8 },
  { symbol: "MARUTI",      sector: "Auto",    price: 10842.6, change: -0.34, sectorMove: 1.18, indexMove: 0.62, oi: 1.8,  pcr: 0.92, iv: 22, trend: 52, technical: 56, liquidity: 74, risk: 44, momentum: -1.8, volume: 54, breadth: 1.2 },
  { symbol: "HINDUNILVR",  sector: "FMCG",    price: 2568.4, change: 0.28, sectorMove: 0.12, indexMove: 0.62, oi: -0.8, pcr: 0.95, iv: 18, trend: 58, technical: 62, liquidity: 88, risk: 48, momentum: 1.2, volume: 52, breadth: 0.8 },
  { symbol: "BHARTIARTL",  sector: "Telecom", price: 1436.2, change: 1.56, sectorMove: 1.05, indexMove: 0.62, oi: 8.2,  pcr: 1.32, iv: 34, trend: 84, technical: 82, liquidity: 80, risk: 55, momentum: 9.6, volume: 92, breadth: 6.8 },
  { symbol: "ASIANPAINT",  sector: "Consumer", price: 2964.8, change: -0.78, sectorMove: -0.42, indexMove: 0.62, oi: -3.2, pcr: 0.76, iv: 25, trend: 42, technical: 46, liquidity: 76, risk: 56, momentum: -4.6, volume: 45, breadth: -3.2 },
  { symbol: "NTPC",        sector: "Energy",  price: 378.6,  change: 0.64, sectorMove: -0.16, indexMove: 0.62, oi: 2.4,  pcr: 1.08, iv: 31, trend: 62, technical: 65, liquidity: 72, risk: 50, momentum: 3.4, volume: 58, breadth: 2.1 },
  { symbol: "WIPRO",       sector: "IT",      price: 498.2,  change: -1.48, sectorMove: -1.48, indexMove: 0.62, oi: 4.2,  pcr: 0.68, iv: 36, trend: 34, technical: 38, liquidity: 70, risk: 52, momentum: -7.2, volume: 60, breadth: -4.5 }
];

export const strategies = [
  { id: "sector-momentum",   name: "Sector Momentum",      desc: "Leading stock in strong sector",                     boost: "sector" },
  { id: "oi-long-buildup",   name: "OI Long Buildup",      desc: "Price up with OI expansion",                        boost: "fo" },
  { id: "oi-short-buildup",  name: "OI Short Buildup",     desc: "Price down with OI expansion",                      boost: "fo" },
  { id: "vwap-pullback",     name: "VWAP Pullback",        desc: "Intraday retest of VWAP",                           boost: "technical" },
  { id: "breakout-oi",       name: "Breakout + OI Conf.",  desc: "Breakout with OI surge",                            boost: "fo" },
  { id: "iv-rank-sell",      name: "IV Rank / Option Sell",desc: "High IV premium selling opportunity",               boost: "options" },
  { id: "max-pain-hedge",    name: "Max Pain Hedge",       desc: "Max Pain magnet near expiry",                       boost: "options" },
  { id: "earnings-momentum", name: "Earnings Momentum",    desc: "Post-earnings OI buildup continuation",             boost: "technical" }
];

export const integrations = [
  { name: "Market data",      state: "Mock",    note: "NSE/BSE vendor feed in production" },
  { name: "Broker bridge",    state: "Mock",    note: "DhanHQ API adapter coming first" },
  { name: "Mutual funds",     state: "Planned", note: "ARN/EOP route after AMFI registration" },
  { name: "Audit log",        state: "Active",  note: "Signal, order and user-action history" },
  { name: "Backtesting",      state: "Active",  note: "VectorBT-style engine for strategy validation" },
  { name: "Paper trading",    state: "Active",  note: "Practice mode with ₹10L virtual balance" },
  { name: "AI assistant",     state: "Active",  note: "LLM-powered strategy analysis and Q&A" },
  { name: "Smart alerts",     state: "Active",  note: "Signal-based notifications for setups" }
];

export const mutualFunds = [
  { name: "Parag Parikh Flexi Cap Fund", amc: "PPFAS", category: "Flexi Cap", nav: 68.42, returns: { "1Y": 18.4, "3Y": 42.6, "5Y": 82.3 }, risk: "Moderate", rating: 5, sip: 1000, minLumpsum: 5000 },
  { name: "HDFC Mid-Cap Opportunities",  amc: "HDFC",   category: "Mid Cap",  nav: 142.8, returns: { "1Y": 22.6, "3Y": 52.8, "5Y": 96.4 }, risk: "High",   rating: 4, sip: 500,  minLumpsum: 5000 },
  { name: "SBI Small Cap Fund",          amc: "SBI",     category: "Small Cap",nav: 96.35, returns: { "1Y": 26.2, "3Y": 48.4, "5Y": 112.6 }, risk: "Very High",rating: 4, sip: 500, minLumpsum: 5000 },
  { name: "ICICI Pru Bluechip Fund",     amc: "ICICI",   category: "Large Cap",nav: 124.6, returns: { "1Y": 15.8, "3Y": 38.2, "5Y": 74.1 }, risk: "Moderate", rating: 5, sip: 1000, minLumpsum: 10000 },
  { name: "Mirae Asset Large Cap Fund",  amc: "Mirae",   category: "Large Cap",nav: 86.72, returns: { "1Y": 16.4, "3Y": 40.6, "5Y": 78.9 }, risk: "Moderate", rating: 4, sip: 1000, minLumpsum: 5000 },
  { name: "Kotak Emerging Equity Fund",  amc: "Kotak",   category: "Mid Cap",  nav: 112.4, returns: { "1Y": 20.8, "3Y": 46.2, "5Y": 88.4 }, risk: "High",   rating: 4, sip: 500,  minLumpsum: 5000 },
  { name: "Axis Bluechip Fund",          amc: "Axis",    category: "Large Cap",nav: 54.82, returns: { "1Y": 14.2, "3Y": 34.6, "5Y": 68.2 }, risk: "Moderate", rating: 3, sip: 500,  minLumpsum: 5000 },
  { name: "Nippon India Small Cap Fund",  amc: "Nippon", category: "Small Cap",nav: 142.6, returns: { "1Y": 28.4, "3Y": 54.2, "5Y": 118.6 }, risk: "Very High",rating: 5, sip: 500, minLumpsum: 5000 }
];

export const sectorIndices = {
  "Auto":     { name: "NIFTY Auto",       value: 12456.8, change: 1.18, pcr: 1.12, iv: 32 },
  "Banking":  { name: "NIFTY Bank",       value: 45682.4, change: 0.74, pcr: 1.05, iv: 28 },
  "Energy":   { name: "NIFTY Energy",     value: 28764.2, change: -0.16, pcr: 0.92, iv: 35 },
  "IT":       { name: "NIFTY IT",         value: 34862.6, change: -1.48, pcr: 0.72, iv: 38 },
  "Infra":    { name: "NIFTY Infra",      value: 6248.4,  change: 0.82, pcr: 1.08, iv: 30 },
  "FMCG":     { name: "NIFTY FMCG",       value: 48642.8, change: 0.12, pcr: 0.98, iv: 24 },
  "Telecom":  { name: "NIFTY Telecom",    value: 2146.5,  change: 1.05, pcr: 1.24, iv: 36 },
  "Finance":  { name: "NIFTY Financial",  value: 16842.6, change: 0.56, pcr: 1.02, iv: 29 },
  "Consumer": { name: "NIFTY Consumer",   value: 7246.8,  change: -0.42, pcr: 0.82, iv: 26 }
};

export const niftyIndex = { name: "NIFTY 50", value: 22648.5, change: 0.62, breadth: 32, advance: 28, decline: 22 };
export const sensexIndex = { name: "SENSEX", value: 74682.2, change: 0.58, breadth: 18, advance: 16, decline: 14 };

export const optionChain = (price) => {
  const strikes = [];
  const base = Math.round(price / 50) * 50;
  for (let i = -5; i <= 5; i++) {
    const strike = base + i * 50;
    const isITM = strike < price;
    const distance = Math.abs(strike - price) / price * 100;
    strikes.push({
      strike,
      ce_oi: Math.round((500000 + Math.sin(i * 1.3) * 300000 + Math.random() * 100000) / 1000) * 1000,
      pe_oi: Math.round((400000 - Math.sin(i * 1.3) * 200000 + Math.random() * 100000) / 1000) * 1000,
      ce_change: Math.round((Math.random() - 0.4) * 15 * 10) / 10,
      pe_change: Math.round((Math.random() - 0.4) * 15 * 10) / 10,
      iv: 25 + Math.random() * 15,
      ltp: isITM ? (price - strike + Math.random() * 5) : Math.max(0.5, (strike - price) * 0.3 + Math.random() * 3),
      isITM
    });
  }
  return strikes;
};
