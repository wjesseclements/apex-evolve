import { useEffect, useRef, useState } from 'react';
import type { GenerationRecord } from '../sim/engine/evolution.ts';
import { drawFitnessChart, layoutFitnessChart, nearestGenerationIndex } from '../render/chart.ts';

/**
 * Best + mean fitness per generation. Redraws when the history length or the
 * hover position changes; DPR-aware; hover shows a crosshair + tooltip.
 */
export function FitnessChart({ history }: { history: readonly GenerationRecord[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 300, h: 150 });
  const count = history.length;
  const lastBest = history[count - 1]?.best ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: Math.max(120, parent.clientWidth), h: 150 });
    });
    ro.observe(parent);
    setSize({ w: Math.max(120, parent.clientWidth), h: 150 });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const layout = layoutFitnessChart(history, size.w, size.h);
    const hover = hoverX === null ? -1 : nearestGenerationIndex(layout, hoverX);
    drawFitnessChart(ctx, layout, history, hover);
    // `count`/`lastBest` are the cheap change signals for the (mutable) history array.
  }, [history, count, lastBest, hoverX, size]);

  return (
    <div className="chart" aria-label="Fitness per generation">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Fitness chart: ${count} generations`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHoverX(e.clientX - r.left);
        }}
        onMouseLeave={() => setHoverX(null)}
      />
    </div>
  );
}
