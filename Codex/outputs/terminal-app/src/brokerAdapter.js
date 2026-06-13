export function createMockBroker(initialOrders = []) {
  let connected = false;
  const orders = [];
  const positions = new Map();

  function upsertPosition(order) {
    const current = positions.get(order.symbol) || {
      symbol: order.symbol,
      quantity: 0,
      averagePrice: 0,
      realizedPnl: 0
    };
    const signedQuantity = order.side === "BUY" ? order.quantity : -order.quantity;
    const nextQuantity = current.quantity + signedQuantity;

    if (nextQuantity === 0) {
      current.realizedPnl += (Number(order.price) - current.averagePrice) * current.quantity * (order.side === "SELL" ? 1 : -1);
      positions.delete(order.symbol);
      return;
    }

    if (current.quantity === 0 || Math.sign(current.quantity) === Math.sign(signedQuantity)) {
      const existingValue = Math.abs(current.quantity) * current.averagePrice;
      const newValue = Math.abs(signedQuantity) * Number(order.price);
      current.averagePrice = (existingValue + newValue) / (Math.abs(current.quantity) + Math.abs(signedQuantity));
    }

    current.quantity = nextQuantity;
    positions.set(order.symbol, current);
  }

  initialOrders.slice().reverse().forEach(order => {
    orders.unshift(order);
    upsertPosition(order);
  });

  return {
    connect() {
      connected = true;
      return {
        connected,
        broker: "Mock Broker",
        account: "VM-001"
      };
    },
    status() {
      return { connected, broker: connected ? "Mock Broker" : "Disconnected" };
    },
    placeOrder(order) {
      if (!connected) {
        return { ok: false, message: "Connect broker before placing order." };
      }
      const result = {
        ok: true,
        id: `MOCK-${orders.length + 1}`,
        status: "COMPLETE",
        time: new Date().toLocaleTimeString(),
        ...order
      };
      orders.unshift(result);
      upsertPosition(result);
      return result;
    },
    orders() {
      return [...orders];
    },
    positions(latestPrices = {}) {
      return [...positions.values()].map(position => {
        const lastPrice = latestPrices[position.symbol] || position.averagePrice;
        const unrealizedPnl = (lastPrice - position.averagePrice) * position.quantity;
        return {
          ...position,
          lastPrice,
          unrealizedPnl
        };
      });
    }
  };
}
