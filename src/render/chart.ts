/**
 * Fitness-over-generations line chart (best + mean), Canvas 2D, no library.
 * Layout is a pure function of (history, width, height) so it can be unit
 * tested; drawing consumes the layout. Depends on sim/ types only.
 *
 * Design: two categorical series in fixed order — best (solid green), mean
 * (dashed blue) — validated for CVD separation and contrast on the dark
 * surface; direct labels at the line ends plus a legend; recessive grid;
 * crosshair + tooltip on hover.
 */

export interface HistoryPoint {
  readonly generation: number;
  readonly best: number;
  readonly mean: number;
}

export interface XY {
  readonly x: number;
  readonly y: number;
}

export interface ChartLayout {
  readonly width: number;
  readonly height: number;
  /** Plot rectangle in px. */
  readonly plot: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  /** Domain. */
  readonly genMax: number;
  readonly yMax: number;
  readonly xTicks: readonly { readonly gen: number; readonly x: number }[];
  readonly yTicks: readonly { readonly value: number; readonly y: number }[];
  readonly best: readonly XY[];
  readonly mean: readonly XY[];
}

export const CHART_COLORS = {
  best: '#57a52a',
  mean: '#4a8ae6',
  grid: 'rgba(230,230,230,0.08)',
  axis: 'rgba(230,230,230,0.25)',
  ink: '#e6e6e6',
  muted: '#9aa0a6',
  surface: '#171a21',
  crosshair: 'rgba(230,230,230,0.35)',
} as const;

const PAD = { left: 44, right: 14, top: 12, bottom: 24 };

/** "Nice" step for ≈ n ticks over [0, max]. */
export function niceStep(max: number, n: number): number {
  if (!(max > 0)) return 1;
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

export function layoutFitnessChart(
  history: readonly HistoryPoint[],
  width: number,
  height: number,
): ChartLayout {
  const plot = {
    left: PAD.left,
    top: PAD.top,
    width: Math.max(1, width - PAD.left - PAD.right),
    height: Math.max(1, height - PAD.top - PAD.bottom),
  };
  const genMax = Math.max(1, history.length > 0 ? history[history.length - 1]!.generation : 1);
  let dataMax = 0;
  for (const h of history) dataMax = Math.max(dataMax, h.best, h.mean);
  const yStep = niceStep(dataMax || 1, 4);
  const yMax = Math.max(yStep, Math.ceil((dataMax || 1) / yStep) * yStep);
  const xOf = (gen: number) => plot.left + (gen / genMax) * plot.width;
  const yOf = (v: number) => plot.top + plot.height - (v / yMax) * plot.height;
  const xTicks: { gen: number; x: number }[] = [];
  const xStep = Math.max(1, niceStep(genMax, 6)); // generations are integers
  for (let g = 0; g <= genMax + 1e-9; g += xStep) xTicks.push({ gen: g, x: xOf(g) });
  const yTicks: { value: number; y: number }[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += yStep) yTicks.push({ value: v, y: yOf(v) });
  return {
    width,
    height,
    plot,
    genMax,
    yMax,
    xTicks,
    yTicks,
    best: history.map((h) => ({ x: xOf(h.generation), y: yOf(h.best) })),
    mean: history.map((h) => ({ x: xOf(h.generation), y: yOf(h.mean) })),
  };
}

/** Index of the history point nearest to screen x (or -1 when empty). */
export function nearestGenerationIndex(layout: ChartLayout, x: number): number {
  let best = -1;
  let bestD = Infinity;
  layout.best.forEach((p, i) => {
    const d = Math.abs(p.x - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function drawFitnessChart(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  history: readonly HistoryPoint[],
  hoverIndex: number,
): void {
  const { plot } = layout;
  ctx.save();
  ctx.fillStyle = CHART_COLORS.surface;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  // Grid + y labels
  for (const t of layout.yTicks) {
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.left, t.y);
    ctx.lineTo(plot.left + plot.width, t.y);
    ctx.stroke();
    ctx.fillStyle = CHART_COLORS.muted;
    ctx.textAlign = 'right';
    ctx.fillText(
      t.value >= 1000 ? `${(t.value / 1000).toFixed(1)}k` : String(t.value),
      plot.left - 6,
      t.y,
    );
  }
  // x labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of layout.xTicks) {
    ctx.fillStyle = CHART_COLORS.muted;
    ctx.fillText(String(t.gen), t.x, plot.top + plot.height + 6);
  }
  // Axes
  ctx.strokeStyle = CHART_COLORS.axis;
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, plot.top + plot.height);
  ctx.lineTo(plot.left + plot.width, plot.top + plot.height);
  ctx.stroke();

  const line = (pts: readonly XY[], color: string, dash: number[]) => {
    if (pts.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    if (pts.length === 1) {
      const p = pts[0]!;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  line(layout.mean, CHART_COLORS.mean, [5, 4]);
  line(layout.best, CHART_COLORS.best, []);

  // Direct labels at the line ends (text in ink, colour swatch beside it).
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const label = (pts: readonly XY[], text: string, color: string, dy: number) => {
    const p = pts[pts.length - 1];
    if (!p) return;
    const x = Math.min(p.x + 6, layout.width - 34);
    ctx.fillStyle = color;
    ctx.fillRect(x, p.y + dy - 4, 8, 8);
    ctx.fillStyle = CHART_COLORS.ink;
    ctx.fillText(text, x + 11, p.y + dy);
  };
  label(layout.best, 'best', CHART_COLORS.best, -8);
  label(layout.mean, 'mean', CHART_COLORS.mean, 8);

  // Hover crosshair + tooltip
  const h = history[hoverIndex];
  const pb = layout.best[hoverIndex];
  const pm = layout.mean[hoverIndex];
  if (h && pb && pm) {
    ctx.strokeStyle = CHART_COLORS.crosshair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pb.x, plot.top);
    ctx.lineTo(pb.x, plot.top + plot.height);
    ctx.stroke();
    for (const [p, c] of [
      [pb, CHART_COLORS.best],
      [pm, CHART_COLORS.mean],
    ] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CHART_COLORS.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const text = `gen ${h.generation}  best ${h.best.toFixed(1)}  mean ${h.mean.toFixed(1)}`;
    const w = ctx.measureText(text).width + 12;
    const tx = Math.min(Math.max(pb.x - w / 2, plot.left), layout.width - w);
    const ty = plot.top + 2;
    ctx.fillStyle = 'rgba(15,17,21,0.92)';
    ctx.fillRect(tx, ty, w, 18);
    ctx.fillStyle = CHART_COLORS.ink;
    ctx.textAlign = 'left';
    ctx.fillText(text, tx + 6, ty + 9);
  }
  ctx.restore();
}
