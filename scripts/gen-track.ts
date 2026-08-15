/**
 * Track authoring helper. Emits a dense centerline polyline as track JSON from
 * a "turtle" description of straights and arcs. Run with Node ≥ 22.18 (native
 * TypeScript stripping):
 *
 *   node scripts/gen-track.ts training > src/sim/track/data/training.json
 *
 * The committed JSON is the runtime source of truth — the app never runs this.
 * Conventions per docs/CONVENTIONS.md: meters, +y down, heading 0 = +x,
 * positive turn angle = right turn = clockwise on screen.
 */

interface Straight {
  readonly kind: 'straight';
  readonly length: number;
}
interface Arc {
  readonly kind: 'arc';
  /** Centerline radius, meters. */
  readonly radius: number;
  /** Signed sweep, degrees. Positive = right turn (clockwise on screen). */
  readonly degrees: number;
}
type Segment = Straight | Arc;

interface TrackDef {
  readonly name: string;
  readonly width: number;
  /** Start position and heading (radians). */
  readonly start: { x: number; y: number; heading: number };
  readonly segments: readonly Segment[];
  /** Target spacing between emitted centerline points, meters. */
  readonly spacing: number;
}

const straight = (length: number): Straight => ({ kind: 'straight', length });
const arc = (radius: number, degrees: number): Arc => ({ kind: 'arc', radius, degrees });

/**
 * "training" — a clockwise loop (right-hand turns) with one left-hand kink so
 * both steering directions are exercised. Straights A/B/C are solved below so
 * the loop closes exactly. Every arc radius is ≥ 18 m; with width 12 the
 * inner edge radius is ≥ 12 m, comfortably above the 10 m minimum turn radius.
 */
function trainingDef(): TrackDef {
  const R1 = 30;
  const R2 = 22;
  const R3 = 18; // the left-hander
  const R4 = 18;
  const R5 = 26;
  const R6 = 26;
  const s1 = 12; // south after T1
  const s2 = 24; // west between T2 and T3
  const s3 = 14; // south after T3 (left-hander)
  const A = 80; // opening straight, east

  // Walk the fixed parts to compute the closure requirement.
  // Turn sequence (heading after each): east → T1(+90) south → T2(+90) west →
  // T3(−90) south → T4(+90) west → T5(+90) north → T6(+90) east.
  //
  // x displacement: A + R1 − R2 − s2 + R3 − R4 − B − R5 − R6 ... derive by walking.
  // Rather than hand-derive, walk numerically with B = C = 0 and solve.
  const walk = (B: number, C: number): { x: number; y: number } => {
    const segs = segmentsFor(A, s1, s2, s3, B, C, R1, R2, R3, R4, R5, R6);
    let x = 0;
    let y = 0;
    let h = 0;
    for (const s of segs) {
      if (s.kind === 'straight') {
        x += Math.cos(h) * s.length;
        y += Math.sin(h) * s.length;
      } else {
        const sweep = (s.degrees * Math.PI) / 180;
        const sign = Math.sign(sweep);
        // Center of the arc is at radius r on the turning side.
        // Right turn (+): center is on the car's right = (−sin h, cos h) side.
        const cx = x - Math.sin(h) * s.radius * sign;
        const cy = y + Math.cos(h) * s.radius * sign;
        const h2 = h + sweep;
        x = cx + Math.sin(h2) * s.radius * sign;
        y = cy - Math.cos(h2) * s.radius * sign;
        h = h2;
      }
    }
    return { x, y };
  };
  // B is a westward straight (contributes −B to x); C is a northward straight
  // (contributes −C to y). Solve linearly from the B=C=0 walk.
  const e0 = walk(0, 0);
  const B = e0.x; // need x_end − B = 0
  const C = e0.y; // need y_end − C = 0
  if (B <= 0 || C <= 0)
    throw new Error(`layout does not close with positive straights: B=${B} C=${C}`);
  return {
    name: 'training',
    width: 12,
    start: { x: 0, y: 0, heading: 0 },
    segments: segmentsFor(A, s1, s2, s3, B, C, R1, R2, R3, R4, R5, R6),
    spacing: 4,
  };
}

function segmentsFor(
  A: number,
  s1: number,
  s2: number,
  s3: number,
  B: number,
  C: number,
  R1: number,
  R2: number,
  R3: number,
  R4: number,
  R5: number,
  R6: number,
): Segment[] {
  return [
    straight(A),
    arc(R1, 90), // → south
    straight(s1),
    arc(R2, 90), // → west
    straight(s2),
    arc(R3, -90), // left-hander → south
    straight(s3),
    arc(R4, 90), // → west
    straight(B),
    arc(R5, 90), // → north
    straight(C),
    arc(R6, 90), // → east, back at start
  ];
}

function emit(def: TrackDef): { name: string; width: number; centerline: [number, number][] } {
  const pts: [number, number][] = [];
  let x = def.start.x;
  let y = def.start.y;
  let h = def.start.heading;
  const push = (px: number, py: number) => pts.push([round(px), round(py)]);
  push(x, y);
  for (const s of def.segments) {
    if (s.kind === 'straight') {
      const n = Math.max(1, Math.round(s.length / def.spacing));
      for (let i = 1; i <= n; i++) {
        push(x + (Math.cos(h) * (s.length * i)) / n, y + (Math.sin(h) * (s.length * i)) / n);
      }
      x += Math.cos(h) * s.length;
      y += Math.sin(h) * s.length;
    } else {
      const sweep = (s.degrees * Math.PI) / 180;
      const sign = Math.sign(sweep);
      const cx = x - Math.sin(h) * s.radius * sign;
      const cy = y + Math.cos(h) * s.radius * sign;
      const arcLen = Math.abs(sweep) * s.radius;
      const n = Math.max(2, Math.round(arcLen / def.spacing));
      for (let i = 1; i <= n; i++) {
        const hi = h + (sweep * i) / n;
        push(cx + Math.sin(hi) * s.radius * sign, cy - Math.cos(hi) * s.radius * sign);
      }
      h += sweep;
      x = cx + Math.sin(h) * s.radius * sign;
      y = cy - Math.cos(h) * s.radius * sign;
    }
  }
  // The loop is closed: the last emitted point coincides with the start. Drop
  // it so the polyline has no duplicate vertex (closure is implicit).
  const last = pts[pts.length - 1];
  const first = pts[0];
  if (!last || !first) throw new Error('empty track');
  const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);
  if (gap > 0.05) throw new Error(`track does not close: gap ${gap.toFixed(3)} m`);
  pts.pop();
  return { name: def.name, width: def.width, centerline: pts };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

const which = process.argv[2] ?? 'training';
const defs: Record<string, () => TrackDef> = { training: trainingDef };
const make = defs[which];
if (!make) {
  process.stderr.write(`unknown track '${which}'; known: ${Object.keys(defs).join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(
  JSON.stringify(emit(make()), null, 0)
    .replace(/\],\[/g, '],\n    [')
    .replace('"centerline":[[', '"centerline":[\n    [')
    .replace(']]}', ']\n  ]\n}\n')
    .replace('{"name"', '{\n  "name"')
    .replace(',"width"', ',\n  "width"')
    .replace(',"centerline"', ',\n  "centerline"'),
);
