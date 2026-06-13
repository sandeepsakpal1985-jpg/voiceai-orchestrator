// ── Vasudeva Chart Engine ────────────────────────────────────────
// Canvas-based candlestick chart with volume, SMA, and Bollinger bands

export function drawCandles(canvas, instrument, timeframe = "1D") {
  if (!canvas || !instrument) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // ── Grid lines ──
  ctx.strokeStyle = "#1e2633";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(0, h * i / 5);
    ctx.lineTo(w, h * i / 5);
    ctx.stroke();
  }

  // ── Generate candle data with timeframe-based resolution ──
  const tfConfig = {
    "1D": { bars: 78, volatilityMult: 1.0, noiseScale: 0.35, sma1: 10, sma2: 25 },
    "1W": { bars: 65, volatilityMult: 1.3, noiseScale: 0.45, sma1: 5, sma2: 13 },
    "1M": { bars: 60, volatilityMult: 1.6, noiseScale: 0.55, sma1: 5, sma2: 10 },
    "1Y": { bars: 52, volatilityMult: 2.0, noiseScale: 0.65, sma1: 4, sma2: 12 }
  };
  const config = tfConfig[timeframe] || tfConfig["1D"];
  const bars = config.bars;
  const barW = w / bars;
  const price = instrument.price || 100;
  const change = instrument.change || 0;
  const volatility = instrument.iv ? instrument.iv / 100 * config.volatilityMult : 0.02 * config.volatilityMult;

  let prev = price / (1 + change / 100);
  const candles = [];
  const baseNoise = price * config.noiseScale * 0.004;

  for (let i = 0; i < bars; i++) {
    const drift = (change / 100 / bars) * price;
    const noise = (Math.sin(i * 1.6 + (instrument.symbol || "").length * 0.5) +
                   Math.cos(i * 0.55 + instrument.technical)) * baseNoise;

    const open = prev;
    const close = open + drift + noise;
    const candleVol = volatility * (0.6 + Math.random() * 0.5);
    const high = Math.max(open, close) + price * candleVol * (0.4 + (i % 7) * 0.06);
    const low = Math.min(open, close) - price * candleVol * (0.35 + (i % 5) * 0.05);

    candles.push({
      open, close, high, low,
      volume: 40 + Math.sin(i * 0.8 + timeframe.length) * 20 + Math.random() * 15,
      isUp: close >= open
    });
    prev = close;
  }

  const hi = Math.max(...candles.map(c => c.high));
  const lo = Math.min(...candles.map(c => c.low));
  const range = hi - lo || 1;

  // Chart area (top 80%)
  const chartH = h * 0.78;
  const volH = h * 0.15;

  const yPrice = v => chartH - ((v - lo) / range) * (chartH - 20) - 10;
  const yVol = v => chartH + 5 + (volH - 10) * (1 - v / 100);

  // ── SMA lines ──
  function drawSMA(period, color, alpha) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha || 0.5;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = period - 1; i < candles.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[i - j].close;
      const sma = sum / period;
      const x = i * barW + barW / 2;
      if (i === period - 1) ctx.moveTo(x, yPrice(sma));
      else ctx.lineTo(x, yPrice(sma));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawSMA(config.sma1, "#5ed7df", 0.6);
  drawSMA(config.sma2, "#efba55", 0.5);

  // ── Candles ──
  candles.forEach((c, i) => {
    const x = i * barW + barW / 2;
    ctx.strokeStyle = c.isUp ? "#35c987" : "#ef4444";
    ctx.fillStyle = ctx.strokeStyle;

    // Wick
    ctx.beginPath();
    ctx.moveTo(x, yPrice(c.high));
    ctx.lineTo(x, yPrice(c.low));
    ctx.stroke();

    // Body
    const bodyY = Math.min(yPrice(c.open), yPrice(c.close));
    const bodyH = Math.max(2, Math.abs(yPrice(c.open) - yPrice(c.close)));
    const bodyW = Math.max(4, barW * 0.55);
    ctx.fillRect(x - bodyW / 2, bodyY, bodyW, bodyH);

    // Volume bar
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x - barW * 0.25, yVol(c.volume), barW * 0.5, volH - (yVol(c.volume) - chartH - 5));
    ctx.globalAlpha = 1;
  });

  // ── Volume axis label ──
  ctx.fillStyle = "#5a6a7a";
  ctx.font = "10px Inter, sans-serif";
  ctx.fillText("Vol", 8, h - 4);
  ctx.fillStyle = "#3a4a5a";
  ctx.fillRect(0, chartH + 4, w, 1);

  // ── Current price label ──
  ctx.fillStyle = "#eef2f7";
  ctx.font = "12px Inter, sans-serif";
  const priceText = `₹${price.toFixed(2)}`;
  const priceX = w - 70;
  const priceY = yPrice(price);
  ctx.fillStyle = "#1a2233";
  ctx.fillRect(priceX - 4, priceY - 10, 68, 18);
  ctx.fillStyle = "#eef2f7";
  ctx.fillText(priceText, priceX, priceY + 4);

  // ── Legend ──
  ctx.font = "10px Inter, sans-serif";
  ctx.fillStyle = "#5ed7df";
  ctx.fillText("SMA 10", w - 110, 14);
  ctx.fillStyle = "#efba55";
  ctx.fillText("SMA 25", w - 110, 28);
}
