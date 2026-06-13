import { scoreInstrument, scoreBreakdown, confidenceLabel, marketRegime, derivativesRead, scannerTag, calculateRisk, signed } from "./analysisEngine.js";
import { createMockBroker } from "./brokerAdapter.js";
import { drawCandles } from "./chart.js";
import { createMarketFeed } from "./marketFeed.js";
import { instruments as seedInstruments, integrations, strategies } from "./mockData.js";
import { loadState, saveState } from "./storage.js";

const feed = createMarketFeed(seedInstruments);
const savedJournal = loadState("journal", []);
const broker = createMockBroker(savedJournal);

const state = {
  instruments: feed.snapshot(),
  selectedSymbol: seedInstruments[0].symbol,
  selectedStrategyId: strategies[0].id,
  journal: savedJournal,
  alertRule: loadState("alertRule", { score: 75, oi: 4 }),
  alerts: loadState("alerts", [])
};

const el = {
  feedStatus: document.querySelector("#feedStatus"),
  regimeStatus: document.querySelector("#regimeStatus"),
  refreshMarket: document.querySelector("#refreshMarket"),
  connectBroker: document.querySelector("#connectBroker"),
  watchlist: document.querySelector("#watchlist"),
  strategies: document.querySelector("#strategies"),
  instrumentMeta: document.querySelector("#instrumentMeta"),
  instrumentName: document.querySelector("#instrumentName"),
  instrumentPrice: document.querySelector("#instrumentPrice"),
  instrumentChange: document.querySelector("#instrumentChange"),
  chart: document.querySelector("#chart"),
  scoreDial: document.querySelector("#scoreDial"),
  scoreValue: document.querySelector("#scoreValue"),
  scoreLabel: document.querySelector("#scoreLabel"),
  scoreReason: document.querySelector("#scoreReason"),
  scoreBreakdown: document.querySelector("#scoreBreakdown"),
  capital: document.querySelector("#capital"),
  riskPercent: document.querySelector("#riskPercent"),
  entryPrice: document.querySelector("#entryPrice"),
  stopPrice: document.querySelector("#stopPrice"),
  riskOutput: document.querySelector("#riskOutput"),
  scanner: document.querySelector("#scanner"),
  derivatives: document.querySelector("#derivatives"),
  brokerState: document.querySelector("#brokerState"),
  buyButton: document.querySelector("#buyButton"),
  sellButton: document.querySelector("#sellButton"),
  quantity: document.querySelector("#quantity"),
  orderType: document.querySelector("#orderType"),
  placeOrder: document.querySelector("#placeOrder"),
  journal: document.querySelector("#journal"),
  integrations: document.querySelector("#integrations"),
  positions: document.querySelector("#positions"),
  orderBook: document.querySelector("#orderBook"),
  alertScore: document.querySelector("#alertScore"),
  alertOi: document.querySelector("#alertOi"),
  saveAlert: document.querySelector("#saveAlert"),
  alerts: document.querySelector("#alerts")
};

function selectedInstrument() {
  return state.instruments.find(item => item.symbol === state.selectedSymbol) || state.instruments[0];
}

function selectedStrategy() {
  return strategies.find(item => item.id === state.selectedStrategyId) || strategies[0];
}

function classForChange(value) {
  return value >= 0 ? "pos" : "neg";
}

function rupee(value, decimals = 2) {
  const clean = Math.abs(value) < 0.005 ? 0 : value;
  return `₹${clean.toFixed(decimals)}`;
}

function syncOrderDefaults() {
  const instrument = selectedInstrument();
  el.entryPrice.value = instrument.price.toFixed(2);
  el.stopPrice.value = (instrument.price * 0.985).toFixed(2);
  calculateAndRenderRisk();
}

function renderWatchlist() {
  el.watchlist.innerHTML = state.instruments.map(instrument => `
    <button class="watch-item ${instrument.symbol === state.selectedSymbol ? "active" : ""}" data-symbol="${instrument.symbol}">
      <span><strong>${instrument.symbol}</strong><br><span class="muted">${instrument.sector} • OI ${signed(instrument.oi)}%</span></span>
      <span class="${classForChange(instrument.change)}">${signed(instrument.change)}%</span>
    </button>
  `).join("");
}

function renderStrategies() {
  el.strategies.innerHTML = strategies.map(strategy => `
    <button class="strategy-item ${strategy.id === state.selectedStrategyId ? "active" : ""}" data-strategy="${strategy.id}">
      <strong>${strategy.name}</strong>
      <span class="muted">${strategy.desc}</span>
    </button>
  `).join("");
}

function renderInstrument() {
  const instrument = selectedInstrument();
  el.instrumentMeta.textContent = `NSE • ${instrument.sector}`;
  el.instrumentName.textContent = instrument.symbol;
  el.instrumentPrice.textContent = `₹${instrument.price.toFixed(2)}`;
  el.instrumentChange.textContent = `${signed(instrument.change)}%`;
  el.instrumentChange.className = classForChange(instrument.change);
  drawCandles(el.chart, instrument);
}

function renderConfidence() {
  const instrument = selectedInstrument();
  const strategy = selectedStrategy();
  const score = scoreInstrument(instrument, strategy);
  const label = confidenceLabel(score);
  el.scoreDial.style.setProperty("--score", score);
  el.scoreValue.textContent = score;
  el.scoreLabel.textContent = label.label;
  el.scoreLabel.className = label.className;
  el.scoreReason.textContent = `${strategy.name}: ${score >= 62 ? "signals are aligned enough for a planned trade" : "wait for better confirmation"}.`;
  el.scoreBreakdown.innerHTML = scoreBreakdown(instrument).map(([name, value, color]) => `
    <div class="score-row">
      <span>${name}</span>
      <span class="bar"><span style="--w:${value}%;--c:${color}"></span></span>
      <strong>${Math.round(value)}</strong>
    </div>
  `).join("");
}

function calculateAndRenderRisk() {
  const result = calculateRisk({
    capital: Number(el.capital.value),
    riskPercent: Number(el.riskPercent.value),
    entry: Number(el.entryPrice.value),
    stop: Number(el.stopPrice.value)
  });
  el.quantity.value = Math.max(1, result.quantity);
  el.riskOutput.textContent = result.quantity > 0
    ? `Risk ₹${result.riskAmount.toFixed(0)}. Suggested quantity ${result.quantity}. Max loss near ₹${result.maxLoss.toFixed(0)}.`
    : "Enter price and stop.";
}

function renderScanner() {
  const strategy = selectedStrategy();
  const ranked = [...state.instruments]
    .map(instrument => ({ instrument, score: scoreInstrument(instrument, strategy) }))
    .sort((a, b) => b.score - a.score);

  el.scanner.innerHTML = ranked.map(({ instrument, score }) => {
    const [label, tagClass] = scannerTag(instrument, score);
    return `
      <button class="scan-card" data-symbol="${instrument.symbol}">
        <span class="scan-head">
          <span><strong>${instrument.symbol}</strong><br><span class="muted">${instrument.sector} • Score ${score}</span></span>
          <span class="tag ${tagClass}">${label}</span>
        </span>
        <span class="muted">${instrument.technical > 65 ? "TA aligned" : "TA mixed"} • ${instrument.sectorMove > 0 ? "sector supportive" : "sector weak"} • ${instrument.oi > 3 ? "OI expansion" : "OI neutral"}</span>
        <span class="${classForChange(instrument.change)}">${signed(instrument.change)}% price • ${signed(instrument.oi)}% OI</span>
      </button>
    `;
  }).join("");
}

function renderDerivatives() {
  el.derivatives.innerHTML = derivativesRead(selectedInstrument()).map(([name, value, read]) => `
    <tr><td>${name}</td><td>${value}</td><td>${read}</td></tr>
  `).join("");
}

function renderJournal() {
  el.journal.innerHTML = state.journal.length ? state.journal.map(item => `
    <div class="journal-item">
      <span><strong>${item.side} ${item.symbol}</strong><br><span class="muted">${item.quantity} @ ₹${item.price} • ${item.strategy}</span></span>
      <span class="${item.side === "BUY" ? "pos" : "neg"}">${item.score}</span>
    </div>
  `).join("") : `<p class="notice">No orders yet. Mock executions will appear here.</p>`;
}

function latestPriceMap() {
  return Object.fromEntries(state.instruments.map(instrument => [instrument.symbol, instrument.price]));
}

function renderPositions() {
  const positions = broker.positions(latestPriceMap());
  el.positions.innerHTML = positions.length ? positions.map(position => `
    <tr>
      <td>${position.symbol}</td>
      <td>${position.quantity}</td>
      <td>${rupee(position.averagePrice)}</td>
      <td>${rupee(position.lastPrice)}</td>
      <td class="${position.unrealizedPnl >= 0 ? "pos" : "neg"}">${rupee(position.unrealizedPnl, 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="muted">No open positions.</td></tr>`;
}

function renderOrderBook() {
  const orders = broker.orders();
  el.orderBook.innerHTML = orders.length ? orders.map(order => `
    <tr>
      <td>${order.id}</td>
      <td class="${order.side === "BUY" ? "pos" : "neg"}">${order.side}</td>
      <td>${order.quantity}</td>
      <td>₹${order.price}</td>
      <td>${order.status}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="muted">No orders yet.</td></tr>`;
}

function evaluateAlerts() {
  const strategy = selectedStrategy();
  const triggered = state.instruments
    .map(instrument => ({ instrument, score: scoreInstrument(instrument, strategy) }))
    .filter(({ instrument, score }) => score >= state.alertRule.score && instrument.oi >= state.alertRule.oi)
    .map(({ instrument, score }) => ({
      id: `${instrument.symbol}-${score}-${Math.round(instrument.oi * 10)}`,
      symbol: instrument.symbol,
      message: `Score ${score}, OI ${signed(instrument.oi)}%`,
      score
    }));

  const existing = new Set(state.alerts.map(alert => alert.id));
  const newAlerts = triggered.filter(alert => !existing.has(alert.id));
  if (newAlerts.length) {
    state.alerts = [...newAlerts, ...state.alerts].slice(0, 8);
    saveState("alerts", state.alerts);
  }
}

function renderAlerts() {
  el.alertScore.value = state.alertRule.score;
  el.alertOi.value = state.alertRule.oi;
  el.alerts.innerHTML = state.alerts.length ? state.alerts.map(alert => `
    <div class="journal-item">
      <span><strong>${alert.symbol}</strong><br><span class="muted">${alert.message}</span></span>
      <span class="pos">${alert.score}</span>
    </div>
  `).join("") : `<p class="notice">No alerts triggered yet.</p>`;
}

function renderIntegrations() {
  el.integrations.innerHTML = integrations.map(item => `
    <div class="integration-item">
      <span><strong>${item.name}</strong><br><span class="muted">${item.note}</span></span>
      <span class="tag ${item.state === "Mock" ? "warn" : ""}">${item.state}</span>
    </div>
  `).join("");
}

function renderStatus() {
  el.regimeStatus.textContent = `Regime: ${marketRegime(state.instruments)}`;
  el.brokerState.textContent = broker.status().connected ? "Mock Broker connected" : "Broker disconnected";
}

function render() {
  evaluateAlerts();
  renderStatus();
  renderWatchlist();
  renderStrategies();
  renderInstrument();
  renderConfidence();
  renderScanner();
  renderDerivatives();
  renderJournal();
  renderIntegrations();
  renderPositions();
  renderOrderBook();
  renderAlerts();
}

function place(side) {
  const instrument = selectedInstrument();
  const strategy = selectedStrategy();
  const score = scoreInstrument(instrument, strategy);
  const result = broker.placeOrder({
    side,
    symbol: instrument.symbol,
    quantity: Number(el.quantity.value),
    price: instrument.price.toFixed(2),
    orderType: el.orderType.value,
    strategy: strategy.name,
    score
  });

  if (!result.ok) {
    el.brokerState.textContent = result.message;
    return;
  }

  state.journal.unshift(result);
  saveState("journal", state.journal);
  renderJournal();
  renderPositions();
  renderOrderBook();
}

function bindEvents() {
  el.refreshMarket.addEventListener("click", () => feed.tick());
  el.connectBroker.addEventListener("click", () => {
    broker.connect();
    el.connectBroker.textContent = "Broker Connected";
    renderStatus();
  });
  el.watchlist.addEventListener("click", event => {
    const button = event.target.closest("[data-symbol]");
    if (!button) return;
    state.selectedSymbol = button.dataset.symbol;
    syncOrderDefaults();
    render();
  });
  el.strategies.addEventListener("click", event => {
    const button = event.target.closest("[data-strategy]");
    if (!button) return;
    state.selectedStrategyId = button.dataset.strategy;
    render();
  });
  el.scanner.addEventListener("click", event => {
    const button = event.target.closest("[data-symbol]");
    if (!button) return;
    state.selectedSymbol = button.dataset.symbol;
    syncOrderDefaults();
    render();
  });
  [el.capital, el.riskPercent, el.entryPrice, el.stopPrice].forEach(input => {
    input.addEventListener("input", calculateAndRenderRisk);
  });
  el.buyButton.addEventListener("click", () => place("BUY"));
  el.sellButton.addEventListener("click", () => place("SELL"));
  el.placeOrder.addEventListener("click", () => place("BUY"));
  el.saveAlert.addEventListener("click", () => {
    state.alertRule = {
      score: Number(el.alertScore.value),
      oi: Number(el.alertOi.value)
    };
    state.alerts = [];
    saveState("alertRule", state.alertRule);
    saveState("alerts", state.alerts);
    render();
  });
  window.addEventListener("resize", () => drawCandles(el.chart, selectedInstrument()));
}

feed.subscribe(instruments => {
  state.instruments = instruments;
  render();
});

bindEvents();
syncOrderDefaults();
render();
setInterval(() => feed.tick(), 7000);
