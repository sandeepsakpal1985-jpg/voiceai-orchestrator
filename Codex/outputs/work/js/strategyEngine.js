// ── Vasudeva Strategy Engine ─────────────────────────────────────
// 8 Pre-built Strategy Templates + Custom Strategy Builder

export const STRATEGIES = [
  {
    id: "sector-momentum",
    name: "Sector Momentum",
    desc: "Stock leading within a strong sector and supportive index trend",
    detail: "Score boost when sector move > 0.5%. Best for trending markets with clear sector leadership.",
    boost: "sector",
    icon: "📈",
    risk: "Moderate",
    timeframe: "Swing (3-15 days)",
    conditions: [
      "Sector move > 0.5%",
      "Technical score > 60",
      "Index trending up or neutral",
      "Volume above average"
    ]
  },
  {
    id: "oi-long-buildup",
    name: "OI Long Buildup",
    desc: "Price rising with futures OI expanding — institutional accumulation",
    detail: "OI expansion with price confirms institutional buying. Strongest signal when PCR > 1.",
    boost: "fo",
    icon: "🚀",
    risk: "Moderate",
    timeframe: "Swing (5-20 days)",
    conditions: [
      "OI change > 3% and rising",
      "Price change positive",
      "PCR > 0.9",
      "Technical score > 55"
    ]
  },
  {
    id: "oi-short-buildup",
    name: "OI Short Buildup",
    desc: "Price falling with OI expanding — short-selling pressure",
    detail: "Warning signal for existing longs. Avoid new longs. Consider hedging.",
    boost: "fo",
    icon: "🔻",
    risk: "High",
    timeframe: "Short-term (1-5 days)",
    conditions: [
      "OI change > 4%",
      "Price change negative > 1%",
      "PCR below 0.8",
      "Volume spiking"
    ]
  },
  {
    id: "vwap-pullback",
    name: "VWAP Pullback",
    desc: "Price retests VWAP from above with oversold technicals",
    detail: "Classic intraday reversal setup. Best in first 2 hours of trading.",
    boost: "technical",
    icon: "📊",
    risk: "Moderate",
    timeframe: "Intraday (same session)",
    conditions: [
      "Price near VWAP (within 0.5%)",
      "RSI < 45 on 15-min chart",
      "Volume confirming",
      "Sector not negative"
    ]
  },
  {
    id: "breakout-oi",
    name: "Breakout + OI Confirmation",
    desc: "Price breaks resistance with OI surging — validated breakout",
    detail: "False breakouts common without OI confirmation. Wait for both price and OI to confirm.",
    boost: "fo",
    icon: "💥",
    risk: "High",
    timeframe: "Swing (3-10 days)",
    conditions: [
      "Price breaking above recent high",
      "OI change > 3%",
      "Volume > 20-day average",
      "Sector supportive"
    ]
  },
  {
    id: "iv-rank-sell",
    name: "IV Rank / Option Selling",
    desc: "IV in top 30th percentile — premium selling opportunity via spreads",
    detail: "High IV inflates option premiums. Sell strangles/iron condors with defined risk.",
    boost: "options",
    icon: "🎯",
    risk: "Moderate (defined risk spreads)",
    timeframe: "Weekly- Monthly expiry",
    conditions: [
      "IV > 35%",
      "OI support/resistance identified",
      "No major event in next 7 days",
      "Liquid options chain"
    ]
  },
  {
    id: "max-pain-hedge",
    name: "Max Pain Hedge",
    desc: "Stock approaching Max Pain — reversal expectation near expiry",
    detail: "Max Pain acts as magnet near expiry. Price tends to gravitate toward this level.",
    boost: "options",
    icon: "🧲",
    risk: "Moderate",
    timeframe: "1-5 days before expiry",
    conditions: [
      "PCR > 1.1",
      "Price within 2% of Max Pain",
      "Expiry within 5 days",
      "OI concentrated at key strikes"
    ]
  },
  {
    id: "earnings-momentum",
    name: "Earnings Momentum",
    desc: "Post-earnings gap with sustained OI buildup — trend continuation",
    detail: "Best earnings momentum setups show OI expansion for 3+ days after result.",
    boost: "technical",
    icon: "📋",
    risk: "High",
    timeframe: "Swing (5-15 days)",
    conditions: [
      "Earnings gap > 3%",
      "OI building for 2+ consecutive days",
      "Technical score > 65",
      "Sector neutral or positive"
    ]
  }
];

/* ── Custom Strategy Builder ──────────────────────────────────── */

export function createCustomStrategy(params) {
  const { name, desc, boost, conditions, weights, minScore } = params;
  return {
    id: `custom-${Date.now()}`,
    name: name || "Custom Strategy",
    desc: desc || "User-defined custom strategy",
    detail: "Custom trading strategy with user-defined parameters",
    boost: boost || "technical",
    icon: "⚙️",
    risk: params.risk || "Custom",
    timeframe: params.timeframe || "Flexible",
    conditions: conditions || [],
    custom: true,
    weights: weights || null,
    minScore: minScore || 50
  };
}

/* ── Strategy Recommendation ──────────────────────────────────── */

export function recommendStrategies(instrument) {
  if (!instrument) return [];
  const matched = [];

  STRATEGIES.forEach(s => {
    let score = 0;
    const cond = s.conditions || [];

    if (s.id === "sector-momentum" && (instrument.sectorMove || 0) > 0.3) score += 2;
    if (s.id === "oi-long-buildup" && (instrument.oi || 0) > 2 && (instrument.change || 0) > 0) score += 3;
    if (s.id === "oi-short-buildup" && (instrument.oi || 0) > 3 && (instrument.change || 0) < -1) score += 3;
    if (s.id === "breakout-oi" && (instrument.oi || 0) > 2 && (instrument.change || 0) > 1) score += 3;
    if (s.id === "iv-rank-sell" && (instrument.iv || 0) > 35) score += 2;
    if (s.id === "max-pain-hedge" && (instrument.pcr || 0) > 1.1) score += 2;
    if (s.id === "earnings-momentum" && (instrument.change || 0) > 2 && (instrument.oi || 0) > 1) score += 2;
    if (s.id === "vwap-pullback" && (instrument.technical || 0) > 65) score += 1;

    if (score >= 2) {
      matched.push({ strategy: s, relevance: score });
    }
  });

  return matched.sort((a, b) => b.relevance - a.relevance);
}
