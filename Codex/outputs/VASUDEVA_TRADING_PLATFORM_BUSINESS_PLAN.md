# VASUDEVA MARKETS TERMINAL — COMPLETE BUSINESS PLAN & TECHNICAL ROADMAP

> **Prepared:** June 6, 2026  
> **Current Prototype:** `outputs/trading-platform-mvp.html`  
> **Modular Scaffold:** `outputs/terminal-app/`

---

## EXECUTIVE SUMMARY

Vasudeva Markets Terminal is a **next-generation AI-powered investment platform** that provides retail and HNI investors with institutional-grade analytics across equities, derivatives (F&O), mutual funds, and multiple asset classes — all through a single unified terminal.

**The Core Insight:** Indian retail traders have access to cheap brokerage but **zero access to integrated, institutional-quality decision support**. Platforms like Zerodha, Groww, and Angel One compete on price, leaving a massive gap for a platform that competes on **intelligence, analysis depth, and execution quality**.

**Revenue Model:**
- **Phase 1 (Months 1–12):** Sub-broker/Authorized Person revenue share (brokerage split), Premium subscriptions (analysis tools, AI signals)
- **Phase 2 (Months 12–24):** Scale to 50,000+ users, add mutual fund distribution commissions, IPO distribution fees
- **Phase 3 (Months 24–36):** Launch proprietary broking firm, full brokerage retention, margin lending interest

**Target Market:** 5 million serious Indian retail & HNI traders who trade at least once a week and use 2+ analysis tools.

---

## 1. MARKET ANALYSIS

### 1.1 Indian Trading Platform Landscape (2025–2026)

| Platform | Users (est.) | USP | Weakness for Us to Exploit |
|----------|-------------|-----|---------------------------|
| **Zerodha** | ~8M | Zero brokerage, tech-first | No integrated analysis; you need separate tools for charts, F&O, TA |
| **Groww** | ~6M | Beginner UX, mutual funds | No depth for serious traders; no F&O analytics |
| **Angel One** | ~5M | Hybrid (research + tech) | Fragmented tools; their "research" is generic |
| **Upstox** | ~4M | Trading tools, speed | No unified AI analysis; no strategy engine |
| **Dhan** | ~1.5M | Trader-focused, modern UI | No mutual funds; no AI/strategy layer |
| **5paisa** | ~2M | Discount + financial hub | Poor UX; no advanced analytics |

### 1.2 Market Gaps We Will Fill

| Gap | Vasudeva Solution |
|-----|------------------|
| **No unified analysis** — traders use 4+ tools (charting, F&O scanner, screener, broker) | All-in-one terminal: chart, options chain, scanner, score, broker, risk in one screen |
| **No AI strategy engine** — no platform auto-scores stocks across dimensions | Multi-factor confidence score: technical + sector + index + F&O + risk = composite score |
| **No strategy templates** — no platform suggests trading setups | Pre-built strategy templates (Sector Momentum, OI Buildup, VWAP Pullback, Options Spreads) |
| **Broker lock-in** — hard to compare or switch brokers | Broker-agnostic adapter architecture (OpenAlgo-inspired) — switch brokers with one click |
| **No integrated mutual funds** — separate apps for stocks vs MFs | Single dashboard: stocks + F&O + mutual funds + other vehicles |
| **No alert intelligence** — basic price alerts; no signal-based alerts | Smart alerts: "Alert me when RELIANCE scores >75 with OI buildup >4%" |
| **No trade journal with context** — basic P&L, not actionable insights | Journal with score, strategy, regime context at time of trade |

### 1.3 Target User Personas

**Persona 1: The Serious Retail Trader (Primary)**
- Age: 25–45
- Trades 3–5x weekly
- Currently uses: Zerodha + TradingView + Sensibull + separate journal
- Pain point: Context-switching between 4+ tools
- Willing to pay: ₹500–1,500/mo for consolidated intelligence
- Wallet: 5L–50L capital, does 50–200 trades/mo

**Persona 2: The HNI / Semi-Pro (High Value)**
- Age: 35–60
- Trades daily, uses options strategies
- Uses: Broker terminal + Bloomberg terminal alternatives + research reports
- Pain point: Can't get institutional tools without paying lakhs
- Willing to pay: ₹3,000–10,000/mo for premium tier
- Wallet: 50L–5Cr capital, does 100–500 trades/mo

**Persona 3: The Aspiring Investor (Long-Term Growth)**
- Age: 22–35
- Invests in stocks + mutual funds monthly
- Uses: Groww, Kuvera
- Pain point: No single place to analyze stocks AND buy MFs with AI help
- Willing to pay: Free tier, upgrade to ₹299/mo for AI insights
- Wallet: 1L–10L, SIPs of ₹5,000–50,000/mo

---

## 2. FEATURE ROADMAP & VALUE CREATION

### 2.1 Core Analysis Engine (Build First — High Value, Medium Effort)

**What It Analyzes (12+ Dimensions Per Stock):**

```
┌─────────────────────────────────────────┐
│           VASUDEVA SCORE ENGINE          │
├─────────────────────────────────────────┤
│ 1. TECHNICAL ANALYSIS  (24% weight)     │
│    - RSI, MACD, Moving Averages          │
│    - Bollinger Bands, VWAP              │
│    - Volume profile, Breakout patterns  │
│                                         │
│ 2. TREND ANALYSIS       (20% weight)    │
│    - Short/med/long-term trend strength │
│    - Moving average alignment          │
│    - ADX / trend direction             │
│                                         │
│ 3. SECTOR ANALYSIS      (16% weight)    │
│    - Sector index performance           │
│    - Sector rotation signals            │
│    - Peer comparison within sector     │
│                                         │
│ 4. INDEX CORRELATION    (10% weight)    │
│    - Nifty 50 / Sensex alignment        │
│    - Broader market regime             │
│    - Beta to market                    │
│                                         │
│ 5. F&O / DERIVATIVES    (14% weight)    │
│    - Futures OI change & trend         │
│    - Put-Call Ratio (PCR) analysis     │
│    - Max Pain calculation              │
│    - IV (Implied Volatility) level     │
│    - Option chain OI concentration     │
│    - Futures premium/discount          │
│    - Rollover percentage               │
│    - Long-Short ratio                  │
│    - India VIX context                 │
│                                         │
│ 6. LIQUIDITY ANALYSIS   (5% weight)     │
│    - Average volume vs 20-day           │
│    - Bid-ask spread                    │
│    - Delivery percentage               │
│                                         │
│ 7. RISK ASSESSMENT      (3% weight)     │
│    - Beta, volatility, drawdown         │
│    - Correlation to portfolio          │
│    - Position sizing guidance          │
└─────────────────────────────────────────┘
```

**Strategy Templates (Pre-built + Customizable):**

1. **Sector Momentum** — Stock, sector, and index trend aligned → Look for sector-leading stocks when both sector and index are trending up
2. **OI Long Buildup** — Price up + OI expanding + bullish PCR → Institutional accumulation signal
3. **OI Short Buildup** — Price down + OI expanding → Short-selling pressure increasing
4. **VWAP Pullback** — Price retests VWAP from above, technicals oversold → Intraday reversal play
5. **Breakout with OI Confirmation** — Price breaks resistance + OI surges → Breakout validation
6. **IV Rank / Options Selling** — IV in top 30% percentile → Premium selling opportunity
7. **Max Pain Hedge** — Stock approaching Max Pain levels → Reversal expectation near expiry
8. **Earnings Momentum** — Post-earnings gap + sustained OI buildup → Trend continuation

### 2.2 High-Value Features (Recommended for Build)

| # | Feature | Value | Effort | Priority |
|---|---------|-------|--------|----------|
| 1 | **Unified Score Engine** (12+ dimensions) | ★★★★★ | Medium | **P0** |
| 2 | **Strategy Templates** (pre-built + custom) | ★★★★★ | Medium | **P0** |
| 3 | **Live Market Feed** (WebSocket) | ★★★★★ | High | **P0** |
| 4 | **Broker Adapter Layer** (multi-broker) | ★★★★★ | High | **P0** |
| 5 | **F&O Option Chain Intelligence** | ★★★★★ | Medium | **P0** |
| 6 | **Setup Scanner** (real-time ranked setups) | ★★★★★ | Medium | **P0** |
| 7 | **Trade Journal with Context** | ★★★★☆ | Low | **P1** |
| 8 | **Smart Alerts** (signal-based, not price-based) | ★★★★★ | Medium | **P1** |
| 9 | **Mutual Fund Integration** | ★★★★☆ | High | **P1** |
| 10 | **Strategy Backtesting Engine** | ★★★★★ | High | **P1** |
| 11 | **AI Chat Assistant** (analyze anything) | ★★★★☆ | Medium | **P1** |
| 12 | **Risk Calculator + Position Sizing** | ★★★★☆ | Low | **P1** |
| 13 | **Paper Trading** (practice with live data) | ★★★★☆ | Medium | **P2** |
| 14 | **Portfolio Analytics** (holdings, P&L, allocation) | ★★★★☆ | Medium | **P2** |
| 15 | **Sector Rotation Dashboard** | ★★★☆☆ | Low | **P2** |
| 16 | **IPO Calendar & Application** | ★★★☆☆ | Medium | **P2** |
| 17 | **Community Strategies Marketplace** | ★★★★★ | High | **P3** |
| 18 | **Mobile App** (companion + alerts) | ★★★★☆ | High | **P3** |
| 19 | **Algo Strategy Builder** (drag-drop visual) | ★★★★★ | Very High | **P3** |
| 20 | **Own Broking Firm Launch** | ★★★★★ | Very High | **P3** |

### 2.3 Mutual Fund & Other Investment Vehicles

**Mutual Fund Integration Plan:**

| Feature | Implementation Path | Timeline |
|---------|-------------------|----------|
| **MF Discovery** (search, filter, compare) | MFAPI.in for NAV data + AMC websites for scheme details | Phase 1 |
| **MF Analysis** (returns, risk, portfolio overlap) | Custom engine on top of scheme data | Phase 1 |
| **SIP Calculator** | Simple math + goal projection | Phase 1 |
| **Direct MF Purchase** | Partner with BSE StAR MF or NSE NMF exchange | Phase 2 (requires ARN) |
| **Regular MF with Commission** | AMFI registration → ARN → earn trail commissions | Phase 2 |
| **Goal-based Investing** | SIP → goal mapping with tracking | Phase 3 |
| **Other Vehicles**: | | |
| → **Fixed Deposits** (FD comparison + booking) | Partner with banks via aggregator APIs | Phase 2 |
| → **NPS (National Pension System)** | NPS Trust API integration | Phase 2 |
| → **Corporate Bonds / Debentures** | BSE/NSE debt segment | Phase 3 |
| → **REITs / InvITs** | Already tradeable via broker — add analysis | Phase 2 |
| → **Gold (Sovereign Gold Bonds / ETFs)** | API + analysis | Phase 1 |
| → **International Stocks (US markets)** | Partner with Vested/INDmoney/Stockal | Phase 3 |

---

## 3. TECHNICAL ARCHITECTURE & OPEN-SOURCE TOOL MAP

### 3.1 Recommended Technology Stack

```
┌──────────────────────────────────────────────────────┐
│                   FRONTEND (Web)                       │
│  React 19 + TypeScript                                 │
│  Vite (build tool)                                     │
│  TanStack Query (server state, caching)                │
│  Zustand (client state, terminal state)                │
│  TradingView Lightweight Charts (candlestick)          │
│  Tailwind CSS + custom component library               │
│  React Router v7                                       │
│  D3.js (heatmaps, advanced viz)                        │
├──────────────────────────────────────────────────────┤
│                   BACKEND (API)                         │
│  FastAPI (Python 3.12)                                  │
│  WebSockets (FastAPI native) — live prices, alerts     │
│  Celery (background tasks, scheduled scans)             │
│  Redis (pub/sub, caching, rate limiting)               │
│  PostgreSQL (users, strategies, journal, audit)         │
│  TimescaleDB extension (time-series candles, OI)       │
├──────────────────────────────────────────────────────┤
│                   ANALYSIS ENGINE                       │
│  TA-Lib / pandas-ta (200+ technical indicators)        │
│  QuantLib (options pricing, Greeks)                    │
│  NumPy / Pandas (data manipulation)                    │
│  scikit-learn (future: ML ranking models)              │
│  Backtrader / VectorBT (backtesting)                   │
├──────────────────────────────────────────────────────┤
│                   INTEGRATION LAYER                     │
│  OpenAlgo (broker adapter reference)                   │
│  DhanHQ API / Zerodha Kite / Upstox / Angel One        │
│  WebSocket client for market data feeds                │
│  MFAPI.in (mutual fund NAV data)                       │
│  BSE StAR MF / NSE NMF (MF transaction API)            │
└──────────────────────────────────────────────────────┘
```

### 3.2 Open Source Projects to Leverage

| Project | Stars | What It Gives Us | How We Use It |
|---------|-------|-----------------|---------------|
| **TradingView Lightweight Charts** | 9k+ | High-performance candlestick charts | Chart component (already using this pattern) |
| **TA-Lib** | 10k+ | 200+ technical indicators | RSI, MACD, SMA, Bollinger, VWAP calculations |
| **pandas-ta** | 5k+ | Pandas-integrated TA | Easy DataFrame-based indicator calculations |
| **Backtrader** | 14k+ | Event-driven backtesting | Backtesting strategy templates |
| **VectorBT** | 5k+ | Ultra-fast vectorized backtesting | Rapid strategy optimization |
| **QuantLib** | 4k+ | Options pricing, Greeks | IV calculation, option chain analysis |
| **OpenAlgo** | 1.5k+ | Broker-agnostic adapter | Reference for broker integration pattern |
| **Freqtrade** | 30k+ | Auto-trading bot reference | Algo strategy builder inspiration |
| **D3.js** | 109k+ | Advanced visualizations | Heatmaps, network graphs, sector maps |
| **yfinance** | 15k+ | Free market data source | Fallback data source |
| **MFAPI.in** | (API) | Free MF NAV + scheme data | Mutual fund discovery & analysis |

### 3.3 Project Scaffold (Recommended Structure)

```
vasudeva-terminal/
├── apps/
│   ├── web/                    # React frontend
│   │   ├── src/
│   │   │   ├── components/     # UI components
│   │   │   ├── features/       # Feature modules
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── stores/         # Zustand stores
│   │   │   └── utils/          # Utilities
│   │   └── package.json
│   └── api/                    # FastAPI backend
│       ├── src/
│       │   ├── routers/        # API endpoints
│       │   ├── services/       # Business logic
│       │   ├── models/         # Data models
│       │   ├── adapters/       # Broker adapters
│       │   └── analysis/       # Scoring engine
│       └── requirements.txt
├── packages/
│   ├── analysis-engine/        # Scoring, indicators, F&O
│   ├── broker-adapters/        # Multi-broker interface
│   ├── market-data/            # Market feed abstraction
│   └── shared/                 # Shared types & contracts
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.web
│   └── Dockerfile.api
└── docs/
    ├── ARCHITECTURE.md
    ├── API.md
    └── BROKER_INTEGRATION.md
```

---

## 4. PHASED BUILD PLAN

### Phase 0: Foundation (Week 1–2) ← **WE ARE HERE**

**What Codex Has Built:**
- `trading-platform-mvp.html` — Single-file prototype with all UI components
- `outputs/terminal-app/` — Modular scaffold (HTML + CSS + 7 JS modules)
- `mvp-technical-roadmap.md` — Technical roadmap document

**What We Need Now:**
- [ ] Set up monorepo with `apps/web`, `apps/api`, `packages/*`
- [ ] Initialize React + TypeScript + Vite for frontend
- [ ] Initialize FastAPI for backend
- [ ] Set up Docker Compose (PostgreSQL + Redis + API + Web)
- [ ] Migrate terminal-app components to React
- [ ] Set up WebSocket infrastructure for live market feed

### Phase 1: Core Terminal (Week 3–6)

- [ ] User authentication (JWT, OAuth)
- [ ] Watchlist CRUD (add/remove/reorder stocks)
- [ ] Live candlestick chart (TradingView Lightweight Charts)
- [ ] Analysis engine (score backend API)
- [ ] Strategy template system
- [ ] F&O Intelligence panel (from prototype)
- [ ] Setup scanner (from prototype)
- [ ] Risk calculator + position sizing
- [ ] Trade journal with persistence
- [ ] Smart alerts (signal-based)
- [ ] Local storage → PostgreSQL migration

### Phase 2: Broker Integration (Week 7–10)

- [ ] Broker adapter interface (abstract contract)
- [ ] DhanHQ API adapter (first real broker — best API for free)
- [ ] Zerodha Kite API adapter (largest user base)
- [ ] OAuth token storage (encrypted)
- [ ] Live order placement via API
- [ ] Holdings & positions sync
- [ ] Order book & history
- [ ] Margin calculator
- [ ] Audit logging (all orders + signals)
- [ ] Paper trading mode (execute against market data without real money)

### Phase 3: Intelligence Layer (Week 11–16)

- [ ] Backtesting engine (Backtrader integration)
- [ ] Custom strategy builder (save parameter overrides)
- [ ] Strategy performance metrics
- [ ] Sector rotation dashboard
- [ ] Market regime detection (improved from prototype)
- [ ] Option chain visualizer (strike-wise OI visualization)
- [ ] Multi-timeframe analysis
- [ ] AI chat assistant (LLM-powered analysis)
- [ ] Portfolio analytics + allocation tracker
- [ ] Mutual fund integration (discovery + analysis first)

### Phase 4: Commercial Launch Prep (Week 17–20)

- [ ] Performance optimization
- [ ] Security audit
- [ ] SEBI compliance review
- [ ] Sub-broker/AP agreement with partner broker
- [ ] Payment gateway for subscriptions
- [ ] Marketing website + landing page
- [ ] Beta user onboarding
- [ ] Monitoring + error tracking (Sentry, Grafana)

---

## 5. REVENUE MODEL & FINANCIAL PROJECTIONS

### 5.1 Revenue Streams

| # | Revenue Stream | Phase | Est. Monthly Revenue (Year 1) | Est. Monthly Revenue (Year 3) |
|---|---------------|-------|------------------------------|------------------------------|
| 1 | **Sub-broker/AP Brokerage Split** | Phase 1 | ₹50,000 – ₹2,00,000 | ₹5,00,000 – ₹15,00,000 |
| 2 | **Premium Subscriptions (Pro Tier ₹999/mo)** | Phase 1 | ₹25,000 – ₹1,00,000 | ₹5,00,000 – ₹20,00,000 |
| 3 | **Basic Subscriptions (Starter ₹299/mo)** | Phase 1 | ₹20,000 – ₹75,000 | ₹3,00,000 – ₹10,00,000 |
| 4 | **Mutual Fund Trail Commissions** | Phase 2 | ₹5,000 – ₹25,000 | ₹1,00,000 – ₹5,00,000 |
| 5 | **IPO Distribution Fees** | Phase 2 | ₹5,000 – ₹20,000 | ₹50,000 – ₹2,00,000 |
| 6 | **Strategy Marketplace (rev share 70/30)** | Phase 3 | — | ₹1,00,000 – ₹5,00,000 |
| 7 | **API Access for Institutions** | Phase 3 | — | ₹2,00,000 – ₹10,00,000 |
| 8 | **Proprietary Brokerage (own firm)** | Phase 3 | — | ₹10,00,000 – ₹50,00,000 |

**Year 1 Target: ₹1,00,000 – ₹4,00,000/mo (1,000–2,000 users)**
**Year 2 Target: ₹15,00,000 – ₹40,00,000/mo (10,000–20,000 users)**
**Year 3 Target: ₹50,00,000 – ₹1,00,00,000+/mo (50,000+ users, own broking)**

### 5.2 Pricing Tiers

| Tier | Price | Features | Target |
|------|-------|----------|--------|
| **Free** | ₹0 | Watchlist, basic chart, limited scanner (5 stocks), basic score | Acquisition |
| **Starter** | ₹299/mo | Full scanner (50+ stocks), strategy templates, risk calculator, 1 alert rule | Aspiring investors |
| **Pro** | ₹999/mo | Everything + F&O intelligence, backtesting, custom strategies, 10 alert rules, broker connection, trade journal | Serious traders |
| **Elite** | ₹2,999/mo | Everything + AI chat assistant, multi-broker, options chain analysis, 50 alert rules, API access | HNIs / Pros |
| **Institutional** | Custom | White-label, dedicated infrastructure, all APIs, compliance-ready | Businesses |

### 5.3 Sub-Broker / Authorized Person Strategy

**Phase 1:** Partner as AP with **Dhan** (best API, 100% free, modern) or **Zerodha** (largest user base, trusted brand)
- Typical revenue split: 30–50% of brokerage generated by referred clients
- Average client generates ₹300–800/mo in brokerage
- Target: 300–500 clients in Year 1 → ~₹50,000–2,00,000/mo revenue share

**Phase 3:** Apply for SEBI stock broker registration
- Net worth requirement: ₹1Cr+ (reduced for discount brokers)
- Exchange membership: NSE + BSE (₹20L–50L deposit)
- Full brokerage retention: 100%
- After reaching 10,000+ users, economics justify this move

---

## 6. REGULATORY COMPLIANCE ROADMAP

| Milestone | Timeline | What's Required |
|-----------|----------|-----------------|
| **Phase 1: Educational/Analysis** | Now | No SEBI registration needed. Analysis = education, not advice. Clear disclaimers. |
| **Phase 2: Execution via Partner** | Month 6 | Partner with SEBI-registered broker as their AP. Exchange will verify NISM cert. |
| **Phase 2: Mutual Fund Distribution** | Month 8 | AMFI registration → ARN. NISM Series V-A certification. |
| **Phase 3: Own Brokerage** | Year 2–3 | SEBI stock broker registration. Exchange membership. Net worth compliance. AML/KYC systems. Data localization. |
| **Ongoing: Advisory** | If needed | SEBI RIA (Investment Advisor) or RA (Research Analyst) registration if providing personalized advice. |

**Critical Compliance Rules:**
1. Never claim "guaranteed returns" — illegal under SEBI
2. Never provide personalized investment advice without RIA license
3. Maintain full audit trail of all signals, user actions, and orders
4. Separate "analysis/education" from "advice" clearly in UI
5. Implement KYC verification before any execution
6. Data localization: All Indian user data must stay in India

---

## 7. COMPETITIVE MOATS

1. **Unified Analysis Score** — No platform combines technical, sector, index, F&O, and risk into one actionable score
2. **Strategy Templates** — Users don't need to be analysts; they pick a strategy and get relevant setups
3. **Broker Agnostic** — Users can switch brokers without leaving our platform
4. **AI-Enhanced** — Chat assistant can explain any analysis, suggest strategies, and answer questions
5. **Integrated Asset Classes** — Stocks + F&O + Mutual Funds + More in one dashboard
6. **Institutional-Grade UX** — Pro-level terminal design without the ₹5L/year Bloomberg price tag

---

## 8. IMMEDIATE NEXT STEPS (GREEN SIGNAL REQUIRED)

I've analyzed everything and here's what I recommend building step by step:

### Step 1: Project Scaffolding (2 hours)
- Set up Next.js + TypeScript frontend with Vite
- Set up FastAPI backend structure
- Docker Compose for infrastructure
- Migrate the current terminal-app into the new structure

### Step 2: Core Terminal MVP (3–5 days)
- Convert all 7 JS modules to proper service architecture
- Implement live chart with TradingView Lightweight Charts
- Implement score engine as proper backend API
- Add WebSocket for live market simulation
- Full responsive UI with all panels

### Step 3: Intelligence Layer (5–7 days)
- Real F&O analytics with TA-Lib
- Backtesting engine
- Strategy template system with custom parameters
- Smart alerts infrastructure
- AI chat assistant (LLM integration)

### Step 4: Broker Integration (5–7 days)
- DhanHQ API adapter (first broker)
- Multi-broker adapter abstract layer
- Secure token storage
- Live order placement and tracking

### Step 5: Polish & Launch Prep (3–5 days)
- Performance optimization
- Security hardening
- Compliance guardrails
- Subscription management
- Documentation

---

> **Waiting for your green signal to begin building.** The full prototype and modular scaffold exist at `outputs/`. The analysis above shows exactly what to build next, in what order, and with which tools. When you say GO, I will execute Phase 0 → Phase 1 sequentially, updating `progress.md` after every milestone.
