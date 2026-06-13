// ── Vasudeva Market Feed Engine ──────────────────────────────────
// Simulates realistic market movement with sector correlation,
// momentum persistence, and regime shifts

import { clamp } from "./analysisEngine.js";

let globalRegimePhase = 0;
let globalBias = 0;

function rotateRegime() {
  globalRegimePhase += 0.015 + Math.random() * 0.01;
  globalBias = Math.sin(globalRegimePhase) * 0.6;
}

rotateRegime();
setInterval(rotateRegime, 45000);

export function createMarketFeed(seedInstruments) {
  let instruments = seedInstruments.map(item => ({ ...item }));
  const subscribers = new Set();
  let tickCount = 0;

  function snapshot() {
    return instruments.map(item => ({ ...item }));
  }

  function publish() {
    subscribers.forEach(cb => cb(snapshot()));
  }

  function tick() {
    tickCount++;
    const sectorGroup = {};
    instruments.forEach(i => {
      if (!sectorGroup[i.sector]) sectorGroup[i.sector] = [];
      sectorGroup[i.sector].push(i);
    });

    const sectorDrift = {};
    Object.entries(sectorGroup).forEach(([sector, items]) => {
      const avgTA = items.reduce((s, i) => s + (i.technical || 50), 0) / items.length;
      const baseDrift = globalBias * 0.3 + (avgTA - 50) * 0.002;
      const sectorOsc = Math.sin(globalRegimePhase * 1.3 + sector.length) * 0.15;
      sectorDrift[sector] = baseDrift + sectorOsc;
    });

    instruments = instruments.map(item => {
      const drift = sectorDrift[item.sector] || 0;
      const noise = (Math.random() - 0.48) * 0.35;
      const momentum = (item.momentum || 0) * 0.15 * (Math.random() > 0.3 ? 1 : -0.5);
      const totalDelta = drift + noise + momentum;

      const newChange = clamp((item.change || 0) + totalDelta, -5, 5);
      const newPrice = Math.max(5, (item.price || 100) * (1 + totalDelta / 100));

      const oiDrift = (Math.random() - 0.47) * 1.2 + (totalDelta > 0 ? 0.15 : -0.1);
      const newOI = clamp((item.oi || 0) + oiDrift, -10, 15);

      return {
        ...item,
        change: Math.round(newChange * 100) / 100,
        price: Math.round(newPrice * 100) / 100,
        oi: Math.round(newOI * 10) / 10,
        technical: Math.round(clamp((item.technical || 50) + totalDelta * 8, 10, 95)),
        trend: Math.round(clamp((item.trend || 50) + totalDelta * 6, 10, 95)),
        momentum: Math.round(clamp((item.momentum || 0) + totalDelta * 3, -20, 20)),
        volume: Math.round(clamp((item.volume || 50) + (Math.random() - 0.5) * 15, 10, 95)),
        breadth: Math.round(clamp((item.breadth || 0) + totalDelta * 2, -10, 10))
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
    },
    forceRegime(bias) {
      globalBias = bias;
    }
  };
}
