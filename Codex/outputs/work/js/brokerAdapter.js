// ── Vasudeva Broker Adapter ──────────────────────────────────────
// Mock broker adapter with paper trading, positions, order book,
// margin calculation, P&L tracking, and multi-broker architecture

export function createMockBroker(initialJournal = []) {
  let connected = false;
  let paperMode = true;
  let balance = 1000000; // ₹10L paper trading balance
  const orders = [];
  const positions = new Map();
  const orderHistory = [];

  function upsertPosition(order) {
    const current = positions.get(order.symbol) || {
      symbol: order.symbol,
      quantity: 0,
      averagePrice: 0,
      realizedPnl: 0,
      sector: order.sector || "Unknown"
    };

    const signedQty = order.side === "BUY" ? order.quantity : -order.quantity;
    const nextQty = current.quantity + signedQty;

    if (nextQty === 0) {
      // Position closed - book realized P&L
      if (current.averagePrice > 0 && current.quantity !== 0) {
        const pnl = (Number(order.price) - current.averagePrice) * current.quantity * (order.side === "SELL" ? 1 : -1);
        current.realizedPnl += pnl;
      }
      positions.delete(order.symbol);
      return;
    }

    // Prevent short position from having zero averagePrice
    if (Math.abs(nextQty) > Math.abs(current.quantity) && Math.sign(current.quantity) !== Math.sign(signedQty) && current.quantity !== 0) {
      // Selling more than owned (going short) fully closes existing position
      current.realizedPnl += (Number(order.price) - current.averagePrice) * current.quantity;
      current.quantity = nextQty;
      current.averagePrice = Number(order.price); // New short entry at fill price
      positions.set(order.symbol, current);
      return;
    }

    // Average down/up (adding to same direction)
    if (current.quantity === 0 || Math.sign(current.quantity) === Math.sign(signedQty)) {
      const existingValue = Math.abs(current.quantity) * current.averagePrice;
      const newValue = Math.abs(signedQty) * Number(order.price);
      const totalQty = Math.abs(current.quantity) + Math.abs(signedQty);
      current.averagePrice = totalQty > 0 ? (existingValue + newValue) / totalQty : Number(order.price);
    }

    current.quantity = nextQty;
    positions.set(order.symbol, current);
  }

  // Load initial journal
  initialJournal.slice().reverse().forEach(order => {
    orders.unshift(order);
    upsertPosition(order);
    orderHistory.push(order);
  });

  function validateOrder(order) {
    const issues = [];
    if (!order.symbol) issues.push("No symbol specified");
    if (!order.quantity || order.quantity < 1) issues.push("Invalid quantity");
    if (!order.price || order.price <= 0) issues.push("Invalid price");
    if (order.side !== "BUY" && order.side !== "SELL") issues.push("Side must be BUY or SELL");

    // Check margin for buy
    if (order.side === "BUY" && paperMode) {
      const cost = order.quantity * Number(order.price);
      if (cost > balance) issues.push(`Insufficient balance: ₹${cost.toLocaleString()} required, ₹${balance.toLocaleString()} available`);
    }

    return issues;
  }

  return {
    connect() {
      connected = true;
      return { connected, broker: "Vasudeva Mock Broker", account: "VM-001", mode: paperMode ? "Paper Trading" : "Live" };
    },
    disconnect() {
      connected = false;
    },
    status() {
      return { connected, broker: connected ? "Vasudeva Broker" : "Disconnected" };
    },
    setPaperMode(mode) {
      paperMode = mode;
    },
    getBalance() {
      return balance;
    },
    fundAccount(amount) {
      balance += amount;
      return balance;
    },
    placeOrder(order) {
      if (!connected) {
        return { ok: false, message: "⚠️ Connect broker before placing order.", error: "NOT_CONNECTED" };
      }

      const validation = validateOrder(order);
      if (validation.length) {
        return { ok: false, message: validation.join("; "), error: "VALIDATION_ERROR" };
      }

      // Deduct balance for buys in paper mode
      if (order.side === "BUY" && paperMode) {
        balance -= order.quantity * Number(order.price);
      }
      if (order.side === "SELL" && paperMode) {
        // Add proceeds
        balance += order.quantity * Number(order.price);
      }

      const result = {
        ok: true,
        id: `ORD-${String(orders.length + 1).padStart(4, "0")}`,
        status: "FILLED",
        time: new Date().toLocaleTimeString(),
        date: new Date().toISOString().split("T")[0],
        ...order,
        paperMode
      };

      orders.unshift(result);
      orderHistory.push(result);
      upsertPosition(result);

      return result;
    },
    orders() {
      return [...orders];
    },
    orderHistory({ symbol, side, limit = 20 } = {}) {
      let filtered = [...orderHistory];
      if (symbol) filtered = filtered.filter(o => o.symbol === symbol);
      if (side) filtered = filtered.filter(o => o.side === side);
      return filtered.slice(0, limit);
    },
    positions(latestPrices = {}) {
      return [...positions.values()].map(pos => {
        const ltp = latestPrices[pos.symbol] || pos.averagePrice;
        const unrealizedPnl = (ltp - pos.averagePrice) * pos.quantity;
        return {
          ...pos,
          lastPrice: ltp,
          unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
          pnlPercent: pos.averagePrice > 0 ? (unrealizedPnl / (Math.abs(pos.quantity) * pos.averagePrice)) * 100 : 0
        };
      });
    },
    calculateMargin(order) {
      // Simplified margin: 20% for CNC, 40% for MIS
      const marginPct = (order.product || "CNC") === "MIS" ? 0.4 : 0.2;
      return Math.round(order.quantity * Number(order.price) * marginPct);
    },
    getPnlSummary(latestPrices) {
      const pos = this.positions(latestPrices);
      let totalUnrealized = 0;
      pos.forEach(p => { totalUnrealized += p.unrealizedPnl; });
      return {
        totalUnrealized: Math.round(totalUnrealized * 100) / 100,
        totalRealized: orders.reduce((s, o) => s + (o.realizedPnl || 0), 0),
        totalOrders: orders.length,
        openPositions: pos.length,
        balance: Math.round(balance)
      };
    }
  };
}
