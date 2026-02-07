export function drawPointsChart(canvas, rows) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 800;
  const cssHeight = canvas.clientHeight || 220;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssWidth;
  const h = cssHeight;
  ctx.clearRect(0, 0, w, h);

  const padding = { l: 36, r: 16, t: 12, b: 26 };
  const plotW = w - padding.l - padding.r;
  const plotH = h - padding.t - padding.b;

  const values = rows.map((r) => r.points);
  const maxV = Math.max(10, ...values);

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.l, y);
    ctx.lineTo(padding.l + plotW, y);
    ctx.stroke();
  }

  // Y labels
  ctx.fillStyle = "rgba(232,238,252,0.75)";
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  for (let i = 0; i <= 4; i++) {
    const v = Math.round(maxV * (1 - i / 4));
    const y = padding.t + (plotH * i) / 4 + 4;
    ctx.fillText(String(v), 6, y);
  }

  const n = rows.length;
  if (n === 0) {
    ctx.fillStyle = "rgba(232,238,252,0.65)";
    ctx.fillText("No data yet. Complete a pomodoro to start tracking points.", padding.l, padding.t + 22);
    return;
  }

  const gap = Math.max(2, Math.floor(plotW / (n * 6)));
  const barW = Math.max(6, Math.floor((plotW - gap * (n - 1)) / n));

  for (let i = 0; i < n; i++) {
    const { points, dateKey } = rows[i];
    const x = padding.l + i * (barW + gap);
    const barH = Math.round((points / maxV) * plotH);
    const y = padding.t + plotH - barH;

    ctx.fillStyle = "rgba(124,92,255,0.8)";
    ctx.fillRect(x, y, barW, barH);

    if (n <= 14) {
      ctx.fillStyle = "rgba(232,238,252,0.65)";
      const label = dateKey.slice(5);
      ctx.save();
      ctx.translate(x + barW / 2, padding.t + plotH + 16);
      ctx.rotate(-0.35);
      ctx.textAlign = "center";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
}

