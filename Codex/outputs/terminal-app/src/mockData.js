export const instruments = [
  { symbol: "TATAMOTORS", sector: "Auto", price: 986.4, change: 1.82, sectorMove: 1.18, indexMove: 0.62, oi: 7.6, pcr: 1.21, iv: 38, trend: 82, technical: 78, liquidity: 88, risk: 67 },
  { symbol: "RELIANCE", sector: "Energy", price: 2914.2, change: -0.42, sectorMove: -0.16, indexMove: 0.62, oi: -2.1, pcr: 0.88, iv: 29, trend: 48, technical: 52, liquidity: 94, risk: 54 },
  { symbol: "HDFCBANK", sector: "Banking", price: 1688.7, change: 0.68, sectorMove: 0.74, indexMove: 0.62, oi: 3.4, pcr: 1.05, iv: 24, trend: 66, technical: 69, liquidity: 96, risk: 72 },
  { symbol: "INFY", sector: "IT", price: 1526.9, change: -1.12, sectorMove: -1.48, indexMove: 0.62, oi: 5.1, pcr: 0.72, iv: 32, trend: 39, technical: 44, liquidity: 86, risk: 46 },
  { symbol: "LT", sector: "Infra", price: 3678.3, change: 1.04, sectorMove: 0.82, indexMove: 0.62, oi: 4.8, pcr: 1.14, iv: 27, trend: 76, technical: 73, liquidity: 82, risk: 70 }
];

export const strategies = [
  { id: "sector-momentum", name: "Sector Momentum", desc: "Stock, sector and index trend aligned", boost: "sector" },
  { id: "oi-long-buildup", name: "OI Long Buildup", desc: "Price up with futures OI expansion", boost: "fo" },
  { id: "vwap-pullback", name: "VWAP Pullback", desc: "Intraday continuation after VWAP retest", boost: "technical" },
  { id: "risk-defined-options", name: "Risk Defined Options", desc: "Use IV and OI support/resistance for spreads", boost: "options" }
];

export const integrations = [
  { name: "Market data", state: "Mock", note: "Replace with licensed vendor websocket feed" },
  { name: "Broker bridge", state: "Mock", note: "Adapter contract ready for Zerodha, Upstox, Dhan or Angel One" },
  { name: "Mutual funds", state: "Planned", note: "MFD/ARN or EOP route after compliance review" },
  { name: "Audit log", state: "Planned", note: "Required for signal, order and user-action history" }
];
