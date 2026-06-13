# Trading Platform MVP Technical Roadmap

## Current Prototype

Deliverable: `trading-platform-mvp.html`

Second deliverable: `terminal-app/index.html`

The second deliverable is a modular browser app scaffold with separate files for:

- `src/analysisEngine.js`
- `src/marketFeed.js`
- `src/brokerAdapter.js`
- `src/chart.js`
- `src/mockData.js`
- `src/main.js`

The current prototype is a dependency-free browser app that demonstrates the first product experience:

- Watchlist with mock live market movement
- Candlestick chart rendering
- Stock, sector, index, F&O and risk scoring
- Strategy template selection
- Trade confidence score
- F&O and option-chain intelligence panel
- Setup scanner
- Risk calculator
- Mock broker connection
- Mock order ticket
- Trade journal
- Compliance and API integration placeholders

## Recommended MVP Architecture

Frontend:

- Next.js or React
- TradingView Lightweight Charts
- WebSocket client for live prices, alerts and order updates
- Zustand or Redux Toolkit for terminal state

Backend:

- FastAPI or Node.js/NestJS
- Broker adapter service
- Market data ingestion service
- Analysis and scoring engine
- Strategy-template engine
- Order and audit service

Storage:

- PostgreSQL for users, strategies, orders, broker sessions and audit logs
- TimescaleDB for candles, indicators, OI snapshots and historical signals
- Redis for live quotes, subscriptions, pub/sub and rate limiting

Analysis libraries:

- TA-Lib or pandas-ta for indicators
- Backtrader or VectorBT for backtesting
- scikit-learn/XGBoost later for ranking models after enough clean data exists

Broker/data foundation:

- Start with a mock broker adapter
- Add one real broker adapter first: Dhan, Upstox or Zerodha
- Use OpenAlgo as a reference for broker integration patterns
- Use licensed data vendor feed for production market data

## Build Phases

### Phase 1: Prototype To Working MVP

Timeline: 4-6 weeks

- Convert static prototype into React app
- Add authentication
- Add watchlists
- Add real chart component
- Add mock backend APIs
- Persist journal, strategies and user settings
- Add scanner and risk calculator as real modules

### Phase 2: Market Data And Broker Beta

Timeline: 4-6 weeks

- Add WebSocket market data service
- Integrate one broker API
- Implement token storage and audit logging
- Add manual order placement
- Add holdings, positions and order book
- Add fail-safe order validation

### Phase 3: Strategy And Backtesting

Timeline: 4-8 weeks

- Add strategy template builder
- Add backtesting engine
- Add paper trading
- Add strategy performance analytics
- Add market-regime filters
- Add explainable score output

### Phase 4: Compliance-Ready Commercial Beta

Timeline: 4-8 weeks

- Legal review of advisory/algo boundaries
- Broker partner review
- Data license review
- Privacy and security review
- Production monitoring
- Incident and audit trail workflows

## First Production Modules To Build

1. User and workspace management
2. Watchlist service
3. Market data adapter
4. Indicator engine
5. F&O/OI analytics service
6. Trade confidence engine
7. Broker adapter interface
8. Order validation service
9. Trade journal
10. Audit log

## Broker Adapter Contract

Every broker integration should implement the same internal interface:

```ts
type BrokerAdapter = {
  loginUrl(): string;
  exchangeToken(authCode: string): Promise<BrokerSession>;
  profile(session: BrokerSession): Promise<UserProfile>;
  holdings(session: BrokerSession): Promise<Holding[]>;
  positions(session: BrokerSession): Promise<Position[]>;
  margins(session: BrokerSession): Promise<MarginSnapshot>;
  quote(session: BrokerSession, instruments: string[]): Promise<Quote[]>;
  placeOrder(session: BrokerSession, order: OrderRequest): Promise<OrderResult>;
  orderBook(session: BrokerSession): Promise<OrderStatus[]>;
};
```

## Compliance Guardrails

- Start with manual order placement.
- Keep analytics explainable and non-guaranteed.
- Do not claim assured returns.
- Do not distribute black-box strategies without legal and regulatory review.
- Keep full audit logs for signal generation, user action and order placement.
- Add pre-trade risk checks before every order.
- Separate education, research, advisory and execution language clearly.

## Next Coding Step

Convert the static prototype into a real app scaffold:

- `apps/web` for frontend
- `apps/api` for backend
- `packages/analysis` for scoring and indicators
- `packages/broker-adapters` for broker integrations
- `packages/shared` for shared TypeScript contracts
