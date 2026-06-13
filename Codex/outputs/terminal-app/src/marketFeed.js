import { clamp } from "./analysisEngine.js";

export function createMarketFeed(seedInstruments) {
  let instruments = seedInstruments.map(item => ({ ...item }));
  const subscribers = new Set();

  function publish() {
    subscribers.forEach(callback => callback(snapshot()));
  }

  function snapshot() {
    return instruments.map(item => ({ ...item }));
  }

  function tick() {
    instruments = instruments.map(item => {
      const delta = (Math.random() - 0.48) * 0.42;
      return {
        ...item,
        change: clamp(item.change + delta, -4, 4),
        price: Math.max(10, item.price * (1 + delta / 100)),
        oi: clamp(item.oi + (Math.random() - 0.5) * 1.6, -8, 12),
        technical: Math.round(clamp(item.technical + delta * 7, 10, 95)),
        trend: Math.round(clamp(item.trend + delta * 5, 10, 95))
      };
    });
    publish();
  }

  return {
    snapshot,
    tick,
    subscribe(callback) {
      subscribers.add(callback);
      callback(snapshot());
      return () => subscribers.delete(callback);
    }
  };
}
