// ── Vasudeva Markets Terminal Server ────────────────────────────
// Serves the terminal app, landing page, and market data proxy API
// Designed to never crash — all API errors return graceful fallbacks

const express = require("express");
const path = require("path");
const app = express();

const PORT = process.env.PORT || 5199;
const CACHE_TTL = 60 * 1000; // 1 minute cache
const quoteCache = new Map();
let yahooFinanceModule = null;

// ── Lazy-load yahoo-finance2 with graceful fallback ──
function getYF() {
  if (!yahooFinanceModule) {
    try {
      yahooFinanceModule = require("yahoo-finance2").default;
    } catch (e) {
      yahooFinanceModule = null;
    }
  }
  return yahooFinanceModule;
}

// ── Middleware ──
app.use(express.json());

// ── CORS ──
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// ── Request timeout (30s) ──
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(504).json({ error: "Gateway timeout", detail: "Upstream data source did not respond." });
  });
  next();
});

// ── Helper: safe Yahoo Finance call with timeout ──
async function safeQuote(symbol) {
  const yf = getYF();
  if (!yf) return null;
  const cacheKey = `quote:${symbol.toUpperCase()}`;
  const cached = quoteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

  try {
    const quote = await yf.quote(symbol);
    const result = {
      symbol: quote.symbol,
      price: quote.regularMarketPrice || 0,
      change: quote.regularMarketChangePercent || 0,
      changeAbs: quote.regularMarketChange || 0,
      open: quote.regularMarketOpen || 0,
      high: quote.regularMarketDayHigh || 0,
      low: quote.regularMarketDayLow || 0,
      volume: quote.regularMarketVolume || 0,
      prevClose: quote.regularMarketPreviousClose || 0,
      marketCap: quote.marketCap || 0,
      timestamp: new Date().toISOString()
    };
    quoteCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    return null;
  }
}

// ── Market Data API Routes ──

// GET /api/quote/:symbol
app.get("/api/quote/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const result = await safeQuote(symbol);
  if (result) return res.json(result);
  res.json({
    symbol,
    price: 0, change: 0, changeAbs: 0,
    open: 0, high: 0, low: 0, volume: 0, prevClose: 0, marketCap: 0,
    error: "Could not fetch live data. Markets may be closed or symbol not found.",
    fallback: true,
    timestamp: new Date().toISOString()
  });
});

// GET /api/history/:symbol
app.get("/api/history/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const period = req.query.period || "1mo";
  const interval = req.query.interval || "1d";
  const yf = getYF();

  if (!yf) return res.json({ error: "Data source not available", fallback: true, data: [] });

  try {
    const now = new Date();
    const periods = { "5d": 5, "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825 };
    const days = periods[period] || 30;
    const period1 = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const result = await yf.historical(symbol, { period1, interval });
    res.json(result || []);
  } catch {
    res.json({ error: `No history for ${symbol}`, fallback: true, data: [] });
  }
});

// GET /api/search/:query
app.get("/api/search/:query", async (req, res) => {
  const query = req.params.query;
  const yf = getYF();
  if (!yf) return res.json([]);

  try {
    const result = await yf.search(query);
    const suggestions = (result.quotes || [])
      .filter(q => q.typeDisp === "Equity" || q.typeDisp === "ETF")
      .slice(0, 10)
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange,
        type: q.typeDisp
      }));
    res.json(suggestions);
  } catch {
    res.json([]);
  }
});

// GET /api/market-summary
app.get("/api/market-summary", async (req, res) => {
  const symbols = ["^NSEI", "^BSESN", "^INDIAVIX", "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS"];
  const quotes = await Promise.all(symbols.map(s => safeQuote(s)));
  res.json({
    nifty: quotes[0] ? { price: quotes[0].price, change: quotes[0].change } : null,
    sensex: quotes[1] ? { price: quotes[1].price, change: quotes[1].change } : null,
    indiaVix: quotes[2] ? { price: quotes[2].price, change: quotes[2].change } : null,
    topStocks: quotes.slice(3).filter(Boolean).map(q => ({
      symbol: ((q.symbol || "")).replace(".NS", ""),
      price: q.price,
      change: q.change
    })),
    timestamp: new Date().toISOString()
  });
});

// GET /api/sectors
app.get("/api/sectors", (req, res) => {
  res.json({
    sectors: [
      { name: "Auto", change: 1.18, pcr: 1.12 },
      { name: "Banking", change: 0.74, pcr: 1.05 },
      { name: "Energy", change: -0.16, pcr: 0.92 },
      { name: "IT", change: -1.48, pcr: 0.72 },
      { name: "Infra", change: 0.82, pcr: 1.08 },
      { name: "FMCG", change: 0.12, pcr: 0.98 },
      { name: "Telecom", change: 1.05, pcr: 1.24 },
      { name: "Finance", change: 0.56, pcr: 1.02 },
      { name: "Consumer", change: -0.42, pcr: 0.82 }
    ]
  });
});

// GET /api/health
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    version: "2.0.0",
    uptime: process.uptime(),
    yahooFinance: getYF() ? "loaded" : "not-available",
    timestamp: new Date().toISOString()
  });
});

// ── Routes ──

// Landing page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "landing.html"), err => {
    if (err) res.sendFile(path.join(__dirname, "index.html"));
  });
});

// Launch terminal
app.get("/launch", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  🚀 Vasudeva Markets Terminal v2`);
  console.log(`  ────────────────────────────────`);
  console.log(`  Landing:  http://localhost:${PORT}`);
  console.log(`  Terminal: http://localhost:${PORT}/launch`);
  console.log(`  API:      http://localhost:${PORT}/api/health`);
  console.log(`  Live data: ${getYF() ? '✅ Yahoo Finance loaded' : '⚠️ yahoo-finance2 not available'}`);
  console.log(`  Ready!    Port ${PORT}\\n`);
});
