export function drawCandles(canvas, instrument) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "#252c38";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, height * i / 5);
    ctx.lineTo(width, height * i / 5);
    ctx.stroke();
  }

  const bars = 54;
  const barWidth = width / bars;
  let previous = instrument.price / (1 + instrument.change / 100);
  const candles = [];

  for (let i = 0; i < bars; i += 1) {
    const drift = instrument.change / 100 / bars * instrument.price;
    const noise = (Math.sin(i * 1.6 + instrument.symbol.length) + Math.cos(i * 0.55)) * instrument.price * 0.0018;
    const open = previous;
    const close = open + drift + noise;
    const high = Math.max(open, close) + instrument.price * (0.002 + (i % 5) * 0.0004);
    const low = Math.min(open, close) - instrument.price * (0.002 + (i % 3) * 0.0005);
    candles.push({ open, close, high, low });
    previous = close;
  }

  const high = Math.max(...candles.map(candle => candle.high));
  const low = Math.min(...candles.map(candle => candle.low));
  const y = value => height - ((value - low) / (high - low)) * (height - 24) - 12;

  candles.forEach((candle, index) => {
    const x = index * barWidth + barWidth / 2;
    const isUp = candle.close >= candle.open;
    ctx.strokeStyle = isUp ? "#35c987" : "#f06272";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, y(candle.high));
    ctx.lineTo(x, y(candle.low));
    ctx.stroke();
    const bodyY = Math.min(y(candle.open), y(candle.close));
    const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close)));
    ctx.fillRect(x - Math.max(2, barWidth * 0.28), bodyY, Math.max(4, barWidth * 0.56), bodyHeight);
  });
}
