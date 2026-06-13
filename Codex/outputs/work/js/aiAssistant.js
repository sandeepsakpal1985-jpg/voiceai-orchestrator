// ── Vasudeva AI Strategy Assistant ──────────────────────────────
// Simulated LLM-powered assistant for analysis, strategy suggestions,
// market insight, and trade explanations

import { scoreInstrument, scoreBreakdown, confidenceLabel, derivativesRead, marketRegime, generateTechnicalSignals } from "./analysisEngine.js";
import { STRATEGIES, recommendStrategies } from "./strategyEngine.js";

const AI_RESPONSES = {
  greeting: [
    "Hello! I'm your AI trading assistant. I can help analyze stocks, explain strategies, check market conditions, or calculate risk. What would you like to explore?",
    "👋 Welcome to Vasudeva AI! I'm here to help you make smarter trading decisions. Ask me about any stock, strategy, or market condition."
  ],
  help: [
    "Here's what I can help with:\n\n📊 **Analyze a stock** — Say \"Analyze TATAMOTORS\"\n📈 **Check market** — \"How's the market today?\"\n🎯 **Suggest strategies** — \"What strategy works for HDFCBANK?\"\n⚙️ **Explain a strategy** — \"Tell me about Sector Momentum\"\n💰 **Calculate risk** — \"Risk for 2.5L capital, 1.5% risk, entry 100, stop 97\"\n🔔 **Set alerts** — \"Alert me if RELIANCE score > 75\"\n📋 **Compare stocks** — \"Compare TATAMOTORS and HDFCBANK\""
  ]
};

function analyzeStock(instrument, strategy) {
  if (!instrument) return "I couldn't find that stock in the current universe.";

  const score = scoreInstrument(instrument, strategy);
  const label = confidenceLabel(score);
  const signals = generateTechnicalSignals(instrument);
  const regime = marketRegime([instrument]);

  let bullSignals = signals.filter(s => s.type === "bullish");
  let bearSignals = signals.filter(s => s.type === "bearish");

  return [
    `## 📊 Analysis: ${instrument.symbol} (${instrument.sector})`,
    ``,
    `**Price:** ₹${instrument.price.toFixed(2)} (${instrument.change >= 0 ? "+" : ""}${instrument.change.toFixed(2)}%)`,
    `**Confidence Score:** ${score}/100 — ${label.label}`,
    `**Strategy Selected:** ${strategy?.name || "Default"}`,
    ``,
    `### Technical Signals`,
    ...signals.map(s => `- ${s.signal}`),
    ``,
    `### Key Metrics`,
    `- OI Change: ${instrument.oi >= 0 ? "+" : ""}${instrument.oi.toFixed(1)}% ${instrument.oi > 3 ? "📈 Expanding" : "➖ Neutral"}`,
    `- PCR: ${instrument.pcr.toFixed(2)} ${instrument.pcr > 1 ? "🛡️ Put Support" : "📉 Call Pressure"}`,
    `- IV: ${instrument.iv}% ${instrument.iv > 35 ? "⚠️ Elevated" : "✅ Normal"}`,
    `- Technical: ${instrument.technical}/100`,
    `- Trend: ${instrument.trend}/100`,
    `- Sector Move: ${instrument.sectorMove >= 0 ? "+" : ""}${instrument.sectorMove.toFixed(2)}%`,
    ``,
    `### Verdict`,
    bullSignals.length > bearSignals.length
      ? `✅ **Bullish bias** with ${bullSignals.length} bullish vs ${bearSignals.length} bearish signals. Consider long setups with stop at ₹${(instrument.price * 0.97).toFixed(2)}.`
      : bearSignals.length > bullSignals.length
      ? `⚠️ **Bearish bias** with ${bearSignals.length} bearish vs ${bullSignals.length} bullish signals. Caution advised for new longs.`
      : `➡️ **Neutral signals.** Wait for clearer direction before entering.`
  ].join("\n");
}

function analyzeMarket(instruments) {
  if (!instruments || !instruments.length) return "No market data available.";

  const regime = marketRegime(instruments);
  const gainers = instruments.filter(i => (i.change || 0) > 0).length;
  const losers = instruments.filter(i => (i.change || 0) < 0).length;
  const topGainer = instruments.reduce((best, i) => (best.change || 0) > (i.change || 0) ? best : i, instruments[0]);
  const topLoser = instruments.reduce((worst, i) => (worst.change || 0) < (i.change || 0) ? worst : i, instruments[0]);

  return [
    `## 📈 Market Overview`,
    ``,
    `**Regime:** ${regime.regime}`,
    `**Breadth:** ${gainers} advancing / ${losers} declining (${Math.round(gainers / instruments.length * 100)}% positive)`,
    `**Sectors:** ${[...new Set(instruments.map(i => i.sector))].join(", ")}`,
    ``,
    `### Top Movers`,
    `- 🟢 **${topGainer.symbol}** ${topGainer.change >= 0 ? "+" : ""}${topGainer.change?.toFixed(2)}% — ${topGainer.sector}`,
    `- 🔴 **${topLoser.symbol}** ${topLoser.change >= 0 ? "+" : ""}${topLoser.change?.toFixed(2)}% — ${topLoser.sector}`,
    ``,
    regime.regime.includes("Bullish") || regime.regime.includes("Uptrend")
      ? "✅ **Favorable environment** for long setups. Look for sector-leading stocks with OI confirmation."
      : regime.regime.includes("Bearish")
      ? "⚠️ **Risk-off environment.** Consider hedges, reduce position size, or wait for reversal signals."
      : regime.regime.includes("Choppy")
      ? "➖ **Sideways market.** Best for mean-reversion strategies or option selling. Avoid breakouts."
      : "📊 **Mixed signals.** Stock-specific approach recommended."
  ].join("\n");
}

function suggestStrategyFor(instrument) {
  if (!instrument) return "I need a stock to analyze for strategy suggestions.";

  const recs = recommendStrategies(instrument);
  if (!recs.length) return `No specific strategies strongly match ${instrument.symbol} right now. Consider "Sector Momentum" as a default.`;

  return [
    `## 🎯 Recommended Strategies for ${instrument.symbol}`,
    ``,
    ...recs.map((r, i) =>
      `${i + 1}. **${r.strategy.icon} ${r.strategy.name}** (Relevance: ${r.relevance}/3)\n   ${r.strategy.desc}\n   _Conditions:_ ${r.strategy.conditions.join(", ")}`
    ),
    ``,
    `**Current best match:** ${recs[0].strategy.name} (${recs[0].strategy.icon})`
  ].join("\n");
}

function explainStrategy(strategyId) {
  const strategy = STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) return `I couldn't find a strategy with that name. Available: ${STRATEGIES.map(s => s.name).join(", ")}`;

  return [
    `## ${strategy.icon} ${strategy.name}`,
    `${strategy.detail}`,
    ``,
    `**Risk Level:** ${strategy.risk}`,
    `**Timeframe:** ${strategy.timeframe}`,
    ``,
    `### Conditions to Trigger`,
    ...strategy.conditions.map(c => `- ✅ ${c}`),
    ``,
    `### When to Exit`,
    `- Take partial profits at 2:1 risk-reward`,
    `- Exit if the stock closes below/above key moving average`,
    `- Consider trailing stop after 3+ days in profit`
  ].join("\n");
}

function calculateRiskResponse(args) {
  const match = args.match(/(\d+[\.\d]*)\s*[Ll]/); // e.g., "2.5L"
  const riskPctMatch = args.match(/(\d+[\.\d]*)\s*%/); // e.g., "1.5%"
  const entryMatch = args.match(/entry\s*(\d+[\.\d]*)/i);
  const stopMatch = args.match(/stop\s*(\d+[\.\d]*)/i);

  const capital = 250000;
  const riskPercent = riskPctMatch ? Number(riskPctMatch[1]) : 1;
  const entry = entryMatch ? Number(entryMatch[1]) : 0;
  const stop = stopMatch ? Number(stopMatch[1]) : 0;

  if (!entry || !stop) return "Please provide entry and stop prices. Example: \"Risk for entry 100, stop 97\"";

  const perShareRisk = Math.abs(entry - stop);
  const riskAmount = capital * riskPercent / 100;
  const qty = perShareRisk > 0 ? Math.floor(riskAmount / perShareRisk) : 0;

  return [
    `## 💰 Risk Calculator`,
    ``,
    `**Capital:** ₹${capital.toLocaleString()}`,
    `**Risk per trade:** ${riskPercent}% = ₹${riskAmount.toLocaleString()}`,
    `**Entry:** ₹${entry.toFixed(2)}`,
    `**Stop:** ₹${stop.toFixed(2)}`,
    `**Risk per share:** ₹${perShareRisk.toFixed(2)}`,
    ``,
    `**Suggested Quantity:** ${qty}`,
    `**Max Loss:** ₹${(qty * perShareRisk).toLocaleString()}`,
    `**Capital Required:** ₹${(qty * entry).toLocaleString()}`,
    ``,
    `_Always maintain proper position sizing. Never risk more than 1-2% per trade._`
  ].join("\n");
}

export function generateResponse(query, instruments, selectedInstrument, selectedStrategy) {
  const q = query.toLowerCase().trim();

  if (!q || q === "hi" || q === "hello") {
    return AI_RESPONSES.greeting[Math.floor(Math.random() * AI_RESPONSES.greeting.length)];
  }

  if (q.includes("help") || q.includes("?")) {
    return AI_RESPONSES.help;
  }

  // Stock analysis
  const stockMatch = instruments?.find(i =>
    q.includes(i.symbol.toLowerCase()) ||
    q.includes(`analyze ${i.symbol.toLowerCase()}`)
  );
  if (stockMatch && (q.includes("analyze") || q.includes(stockMatch.symbol.toLowerCase()))) {
    return analyzeStock(stockMatch, selectedStrategy);
  }

  // Market analysis
  if (q.includes("market") || q.includes("regime") || q.includes("overview") || q.includes("how's the market")) {
    return analyzeMarket(instruments);
  }

  // Strategy recommendation
  if (q.includes("suggest") || q.includes("recommend") || q.includes("what strategy")) {
    if (stockMatch) return suggestStrategyFor(stockMatch);
    if (selectedInstrument) return suggestStrategyFor(selectedInstrument);
    return "Which stock would you like strategy suggestions for?";
  }

  // Strategy explanation
  const stratMatch = STRATEGIES.find(s =>
    q.includes(s.name.toLowerCase()) || q.includes(s.id.toLowerCase())
  );
  if (stratMatch && (q.includes("tell") || q.includes("explain") || q.includes("what is") || q.includes("about"))) {
    return explainStrategy(stratMatch.id);
  }
  if (q.includes("strategies") || q.includes("templates")) {
    return [
      "## 📋 Available Strategies",
      "",
      ...STRATEGIES.map(s => `- **${s.icon} ${s.name}** — ${s.desc} (${s.risk} risk, ${s.timeframe})`),
      "",
      "Ask me to 'explain [strategy name]' for details!"
    ].join("\n");
  }

  // Risk calculation
  if (q.includes("risk") && (q.includes("entry") || q.includes("stop") || q.includes("%"))) {
    return calculateRiskResponse(q);
  }

  // Comparison
  if (q.includes("compare") || q.includes("vs")) {
    const symbols = q.match(/\b[A-Z]{2,}\b/g);
    if (symbols && symbols.length >= 2) {
      const stock1 = instruments?.find(i => i.symbol === symbols[0]);
      const stock2 = instruments?.find(i => i.symbol === symbols[1]);
      if (stock1 && stock2) {
        const s1 = scoreInstrument(stock1, selectedStrategy);
        const s2 = scoreInstrument(stock2, selectedStrategy);
        return [
          `## 📋 Comparison: ${stock1.symbol} vs ${stock2.symbol}`,
          ``,
          `| Metric | ${stock1.symbol} | ${stock2.symbol} |`,
          `|--------|:-----:|:-----:|`,
          `| Score | ${s1} | ${s2} |`,
          `| Price | ₹${stock1.price.toFixed(2)} | ₹${stock2.price.toFixed(2)} |`,
          `| Change | ${stock1.change >= 0 ? "+" : ""}${stock1.change.toFixed(2)}% | ${stock2.change >= 0 ? "+" : ""}${stock2.change.toFixed(2)}% |`,
          `| OI | ${stock1.oi >= 0 ? "+" : ""}${stock1.oi.toFixed(1)}% | ${stock2.oi >= 0 ? "+" : ""}${stock2.oi.toFixed(1)}% |`,
          `| Technical | ${stock1.technical}/100 | ${stock2.technical}/100 |`,
          `| PCR | ${stock1.pcr.toFixed(2)} | ${stock2.pcr.toFixed(2)} |`,
          ``,
          `**Winner:** ${s1 > s2 ? `${stock1.symbol} (${s1} vs ${s2})` : `${stock2.symbol} (${s2} vs ${s1})`}`
        ].join("\n");
      }
    }
  }

  // Default response
  return [
    `I understand you're asking about "${query}". Here's what I can help with:`,
    ``,
    AI_RESPONSES.help
  ].join("\n");
}
