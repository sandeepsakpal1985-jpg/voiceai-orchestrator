// ── Vasudeva Options Chain Engine ───────────────────────────────
// Strike-wise OI visualization, PCR analysis, Max Pain, IV skew

import { optionChain } from "./mockData.js";

export function generateChain(price = 1000) {
  return optionChain(price);
}

export function analyzeChain(chain) {
  if (!chain || !chain.length) return null;

  let totalCEOI = 0, totalPEOI = 0;
  let maxPainStrike = null;
  let minPain = Infinity;
  let highestCEOI = 0, highestPEOI = 0;
  let highestCEStrike = 0, highestPEStrike = 0;
  let avgIV = 0;

  chain.forEach(row => {
    totalCEOI += row.ce_oi;
    totalPEOI += row.pe_oi;
    avgIV += row.iv;

    if (row.ce_oi > highestCEOI) { highestCEOI = row.ce_oi; highestCEStrike = row.strike; }
    if (row.pe_oi > highestPEOI) { highestPEOI = row.pe_oi; highestPEStrike = row.strike; }

    // Max Pain: strike where total dollar loss is minimized
    const pain = chain.reduce((sum, r) => {
      const ceObligation = Math.max(0, r.strike - row.strike) * r.ce_oi;
      const peObligation = Math.max(0, row.strike - r.strike) * r.pe_oi;
      return sum + Math.min(ceObligation, peObligation);
    }, 0);

    if (pain < minPain) { minPain = pain; maxPainStrike = row.strike; }
  });

  avgIV /= chain.length;
  const pcr = totalPEOI > 0 ? totalCEOI / totalPEOI : 1;

  return {
    totalCEOI,
    totalPEOI,
    pcr,
    maxPainStrike,
    highestCEOI: { strike: highestCEStrike, oi: highestCEOI },
    highestPEOI: { strike: highestPEStrike, oi: highestPEOI },
    avgIV: Math.round(avgIV * 10) / 10
  };
}

export function drawOptionChain(canvas, chain, price = 1000) {
  if (!canvas || !chain) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  if (!chain.length) {
    ctx.fillStyle = "#5a6a7a";
    ctx.font = "14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No option chain data available", w / 2, h / 2);
    return;
  }

  // Layout
  const leftW = w * 0.35;
  const rightW = w * 0.35;
  const centerW = w * 0.3;
  const barHeight = 18;
  const rowH = Math.min(barHeight + 6, (h - 30) / chain.length);
  const chartTop = 20;

  // Header
  ctx.fillStyle = "#5a6a7a";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PUT OI", leftW / 2, 14);
  ctx.fillText("Strike", leftW + centerW / 2, 14);
  ctx.fillText("CALL OI", leftW + centerW + rightW / 2, 14);

  // Max OI for scaling
  const maxOI = Math.max(...chain.map(r => Math.max(r.ce_oi, r.pe_oi)));

  chain.forEach((row, i) => {
    const y = chartTop + 4 + i * rowH;
    const isStraddle = row.strike === price;
    const isITM = row.strike < price;

    // Strike label - highlight ATM
    ctx.textAlign = "center";
    ctx.font = isStraddle ? "bold 11px Inter, sans-serif" : "10px Inter, sans-serif";
    ctx.fillStyle = isStraddle ? "#efba55" : "#9da8b7";
    ctx.fillText(row.strike.toString(), leftW + centerW / 2, y + 10);

    // Call OI bar (right side, green)
    const ceWidth = (row.ce_oi / maxOI) * rightW * 0.85;
    ctx.fillStyle = "rgba(53, 201, 135, 0.35)";
    ctx.fillRect(leftW + centerW + 4, y, ceWidth, barHeight);
    ctx.fillStyle = "#35c987";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText((row.ce_oi / 100000).toFixed(1) + "L", leftW + centerW + 6, y + 10);

    // Put OI bar (left side, red)
    const peWidth = (row.pe_oi / maxOI) * leftW * 0.85;
    ctx.fillStyle = "rgba(239, 68, 68, 0.35)";
    ctx.fillRect(leftW - peWidth - 4, y, peWidth, barHeight);
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "right";
    ctx.fillText((row.pe_oi / 100000).toFixed(1) + "L", leftW - 6, y + 10);

    // ATM marker line
    if (isStraddle) {
      ctx.strokeStyle = "#efba55";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y + barHeight / 2);
      ctx.lineTo(w, y + barHeight / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  // Max Pain marker
  const analysis = analyzeChain(chain);
  if (analysis && analysis.maxPainStrike) {
    const idx = chain.findIndex(r => r.strike === analysis.maxPainStrike);
    if (idx >= 0) {
      ctx.fillStyle = "#a78bfa";
      ctx.font = "9px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`⬡ Max Pain: ${analysis.maxPainStrike}`, 4, h - 4);
    }
  }
}
