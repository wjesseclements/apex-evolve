/**
 * Deterministic elementary functions for the simulation core.
 *
 * WHY: JavaScript engines are free to implement Math.sin/cos/exp/… with
 * different algorithms, and in practice their results differ in the last bits
 * across engines and versions (we observed macOS/arm64 Node 26 vs Linux/x64
 * Node 22 disagreeing on a 1200-tick physics trajectory). This project
 * promises "same seed ⇒ identical run" as a shareable feature, so every
 * transcendental used by sim/ is computed here using only IEEE-754 basic
 * arithmetic (+ − × ÷, comparisons), Math.floor/abs, and Math.sqrt (hardware
 * correctly-rounded square root in every engine). Those operations are
 * exactly specified, so results are bit-identical everywhere. The purity
 * lint bans Math.sin/cos/… inside src/sim.
 *
 * ACCURACY: the polynomial kernels are ported from Sun's fdlibm (see notice
 * below) and are accurate to ~1 ulp on their reduced ranges. Argument
 * reduction for sin/cos is a three-part Cody-Waite reduction, accurate for
 * |x| < ~1e6 rad (2^20·π/2 = 1.6e6). Beyond that accuracy degrades gracefully
 * but results stay finite and deterministic. Headings in this sim are
 * unwrapped but never get anywhere near that (a car spinning at full lock
 * for an hour reaches ~9e3 rad).
 *
 * ---------------------------------------------------------------------------
 * Portions derived from fdlibm (http://www.netlib.org/fdlibm/):
 *
 *   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 *   Developed at SunPro, a Sun Microsystems, Inc. business.
 *   Permission to use, copy, modify, and distribute this
 *   software is freely granted, provided that this notice
 *   is preserved.
 * ---------------------------------------------------------------------------
 */

// ------------------------------------------------------------------ helpers

const view = new DataView(new ArrayBuffer(8));

/** Return x with the low 32 bits of its IEEE representation cleared (fdlibm SET_LOW_WORD(…, 0)). */
function clearLowWord(x: number): number {
  view.setFloat64(0, x); // big-endian: high word at byte 0, low word at byte 4
  view.setUint32(4, 0);
  return view.getFloat64(0);
}

/**
 * x · 2^k computed exactly by repeated multiplication with exact powers of two
 * (Math.pow(2, k) is not guaranteed exact by ECMA-262). k is clamped to the
 * useful range; results overflow to Infinity / underflow to 0 as IEEE dictates.
 */
function scalbn(x: number, k: number): number {
  let y = x;
  let n = k;
  while (n > 0) {
    const step = n > 512 ? 512 : n;
    y *= pow2(step);
    n -= step;
    if (y === Infinity) return y;
  }
  while (n < 0) {
    const step = -n > 512 ? 512 : -n;
    y /= pow2(step);
    n += step;
    if (y === 0) return y;
  }
  return y;
}

/** POW2[i] = 2^i, i in [0, 512], built by exact doubling. */
const POW2: readonly number[] = (() => {
  const t: number[] = [1];
  let v = 1;
  for (let i = 1; i <= 512; i++) {
    v *= 2;
    t.push(v);
  }
  return t;
})();

function pow2(i: number): number {
  const v = POW2[i];
  if (v === undefined) throw new RangeError(`pow2(${i}) out of table range`);
  return v;
}

// -------------------------------------------------------- sin / cos kernels

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

/** sin on [−π/4, π/4]; x = head, y = tail of the reduced argument. */
function kernelSin(x: number, y: number, hasTail: boolean): number {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (!hasTail) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

/** cos on [−π/4, π/4]; x = head, y = tail of the reduced argument. */
function kernelCos(x: number, y: number): number {
  const ax = x < 0 ? -x : x;
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ax < 0.3) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ax > 0.78125 ? 0.28125 : clearLowWord(ax / 4);
  const hz = 0.5 * z - qx;
  const a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

// ------------------------------------------------- argument reduction (π/2)

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417; // first 33 bits of π/2 (π/2 − PIO2_1 = 6.0771005065061922e-11 ≈ PIO2_2 + PIO2_2T)
const PIO2_2 = 6.0771005063039659766e-11; // second 33 bits (its tail 2.0222662487959506e-21 ≈ PIO2_3, used by round 3)
const PIO2_3 = 2.0222662487111664558e-21; // third 33 bits
const PIO2_3T = 8.47842766036889956997e-32;
const PIO4 = 7.85398163397448278999e-1;

/** Reduced argument: x = n·(π/2) + (head + tail), |head| ≤ π/4. */
interface Reduced {
  n: number;
  head: number;
  tail: number;
}
const reduced: Reduced = { n: 0, head: 0, tail: 0 };

/**
 * Three-part Cody-Waite reduction (fdlibm's "medium size" path, always run to
 * the third round so no bit inspection is needed). Writes into `reduced`.
 */
function remPio2(x: number): void {
  const ax = x < 0 ? -x : x;
  if (ax <= PIO4) {
    reduced.n = 0;
    reduced.head = x;
    reduced.tail = 0;
    return;
  }
  const fn = Math.floor(ax * INV_PIO2 + 0.5);
  // 1st round (good to 85 bits): r = ax − fn·PIO2_1; the tail fn·PIO2_1T is
  // re-derived more precisely by the 2nd round (PIO2_2 ≈ PIO2_1T), as in fdlibm.
  let r = ax - fn * PIO2_1;
  // 2nd round (good to 118 bits)
  let t = r;
  let w = fn * PIO2_2;
  r = t - w;
  // (fdlibm forms the round-2 tail fn·PIO2_2T here; since we always run the
  // 3rd round, which re-derives it from PIO2_3 ≈ PIO2_2T, it is skipped.)
  // 3rd round (good to 151 bits)
  t = r;
  w = fn * PIO2_3;
  r = t - w;
  w = fn * PIO2_3T - (t - r - w);
  const head = r - w;
  const tail = r - head - w;
  if (x < 0) {
    reduced.n = -fn;
    reduced.head = -head;
    reduced.tail = -tail;
  } else {
    reduced.n = fn;
    reduced.head = head;
    reduced.tail = tail;
  }
}

const TINY = 7.450580596923828125e-9; // 2^-27

/** Deterministic sine. */
export function sin(x: number): number {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  const ax = x < 0 ? -x : x;
  if (ax < TINY) return x;
  if (ax <= PIO4) return kernelSin(x, 0, false);
  remPio2(x);
  const q = ((reduced.n % 4) + 4) % 4;
  switch (q) {
    case 0:
      return kernelSin(reduced.head, reduced.tail, true);
    case 1:
      return kernelCos(reduced.head, reduced.tail);
    case 2:
      return -kernelSin(reduced.head, reduced.tail, true);
    default:
      return -kernelCos(reduced.head, reduced.tail);
  }
}

/** Deterministic cosine. */
export function cos(x: number): number {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  const ax = x < 0 ? -x : x;
  if (ax < TINY) return 1;
  if (ax <= PIO4) return kernelCos(x, 0);
  remPio2(x);
  const q = ((reduced.n % 4) + 4) % 4;
  switch (q) {
    case 0:
      return kernelCos(reduced.head, reduced.tail);
    case 1:
      return -kernelSin(reduced.head, reduced.tail, true);
    case 2:
      return -kernelCos(reduced.head, reduced.tail);
    default:
      return kernelSin(reduced.head, reduced.tail, true);
  }
}

// ------------------------------------------------------------ atan / atan2

// atan(0.5), atan(1), atan(1.5), atan(∞) as hi + lo double-double pairs.
const ATAN_HI_0 = 4.63647609000806093515e-1;
const ATAN_HI_1 = 7.85398163397448278999e-1;
const ATAN_HI_2 = 9.82793723247329054082e-1;
const ATAN_HI_3 = 1.570796326794896558;
const ATAN_LO_0 = 2.26987774529616870924e-17;
const ATAN_LO_1 = 3.06161699786838301793e-17;
const ATAN_LO_2 = 1.39033110312309984516e-17;
const ATAN_LO_3 = 6.12323399573676603587e-17;
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.1111110405462355788e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.6531572744216915527e-2;
const AT10 = 1.62858201153657823623e-2;
const TWO66 = 4294967296 * 4294967296 * 4; // 2^66, exact

/** Deterministic arctangent. */
export function atan(x: number): number {
  if (x !== x) return NaN;
  const neg = x < 0;
  let ax = neg ? -x : x;
  if (ax >= TWO66) {
    const v = ATAN_HI_3 + ATAN_LO_3;
    return neg ? -v : v;
  }
  let hi = 0;
  let lo = 0;
  let id: number;
  if (ax < 0.4375) {
    if (ax < TINY) return x;
    id = -1;
  } else if (ax < 1.1875) {
    if (ax < 0.6875) {
      id = 0;
      hi = ATAN_HI_0;
      lo = ATAN_LO_0;
      ax = (2 * ax - 1) / (2 + ax);
    } else {
      id = 1;
      hi = ATAN_HI_1;
      lo = ATAN_LO_1;
      ax = (ax - 1) / (ax + 1);
    }
  } else if (ax < 2.4375) {
    id = 2;
    hi = ATAN_HI_2;
    lo = ATAN_LO_2;
    ax = (ax - 1.5) / (1 + 1.5 * ax);
  } else {
    id = 3;
    hi = ATAN_HI_3;
    lo = ATAN_LO_3;
    ax = -1 / ax;
  }
  const z = ax * ax;
  const w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) {
    const v = ax - ax * (s1 + s2);
    return neg ? -v : v;
  }
  const v = hi - (ax * (s1 + s2) - lo - ax);
  return neg ? -v : v;
}

const PI_HI = 3.141592653589793116;
const PI_LO = 1.2246467991473532e-16; // fdlibm 1.2246467991473531772E-16, same double
const PIO2_HI = 1.570796326794896558;

/**
 * Deterministic atan2(y, x): angle of the vector (x, y) in (−π, π].
 * Under this project's y-down convention a positive result is clockwise on
 * screen. Special cases follow the C99/fdlibm conventions.
 */
export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (x === 1) return atan(y);
  const yNeg = y < 0 || (y === 0 && 1 / y < 0);
  const xNeg = x < 0 || (x === 0 && 1 / x < 0);
  if (y === 0) {
    if (!xNeg) return y; // ±0
    return yNeg ? -PI_HI : PI_HI;
  }
  if (x === 0) return yNeg ? -PIO2_HI : PIO2_HI;
  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) {
      if (!xNeg) return yNeg ? -PIO4 : PIO4;
      return yNeg ? -3 * PIO4 : 3 * PIO4;
    }
    if (!xNeg) return yNeg ? -0 : 0;
    return yNeg ? -PI_HI : PI_HI;
  }
  if (y === Infinity || y === -Infinity) return yNeg ? -PIO2_HI : PIO2_HI;
  const ay = yNeg ? -y : y;
  const ax = xNeg ? -x : x;
  const z = atan(ay / ax); // atan(Infinity) = π/2 handles overflow of the quotient
  if (!xNeg) return yNeg ? -z : z;
  return yNeg ? z - PI_LO - PI_HI : PI_HI - (z - PI_LO);
}

// ---------------------------------------------------------------- exp / tanh

const O_THRESHOLD = 7.09782712893383973096e2;
const U_THRESHOLD = -7.4513321910194110842e2;
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const HALF_LN2 = 3.4657359027997264e-1; // 0.5·ln2 (fdlibm threshold 0x3fd62e42)
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;
const TWO_M28 = 3.725290298461914e-9; // 2^-28

/** Deterministic e^x. */
export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x === Infinity) return Infinity;
  if (x === -Infinity) return 0;
  if (x > O_THRESHOLD) return Infinity;
  if (x < U_THRESHOLD) return 0;
  const ax = x < 0 ? -x : x;
  let k = 0;
  let hi = 0;
  let lo = 0;
  let xr = x;
  if (ax > HALF_LN2) {
    if (ax < 1.5 * LN2_HI + 1.5 * LN2_LO) {
      // |x| < 1.5·ln2 → k = ±1
      if (x < 0) {
        hi = x + LN2_HI;
        lo = -LN2_LO;
        k = -1;
      } else {
        hi = x - LN2_HI;
        lo = LN2_LO;
        k = 1;
      }
    } else {
      k = Math.trunc(INV_LN2 * x + (x < 0 ? -0.5 : 0.5)); // C's (int) cast: round half away from zero
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    xr = hi - lo;
  } else if (ax < TWO_M28) {
    return 1 + x;
  }
  const t = xr * xr;
  const c = xr - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((xr * c) / (c - 2) - xr);
  const y = 1 - (lo - (xr * c) / (2 - c) - hi);
  return scalbn(y, k);
}

/**
 * e^u − 1 for |u| ≤ 0.5·ln2, without cancellation (the k = 0 branch of exp
 * rearranged). Used by tanh near zero.
 */
function expm1Small(u: number): number {
  const t = u * u;
  const c = u - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  return u + (u * c) / (2 - c);
}

/**
 * Deterministic tanh. Saturates to exactly ±1 for |x| ≥ 22 (as fdlibm: the
 * true value differs from 1 by less than half an ulp there).
 */
export function tanh(x: number): number {
  if (x !== x) return NaN;
  const neg = x < 0;
  const ax = neg ? -x : x;
  if (ax < TWO_M28) return x;
  if (ax >= 22) return neg ? -1 : 1;
  let z: number;
  if (ax <= 0.5 * HALF_LN2) {
    // 2·|x| ≤ 0.5·ln2 → cancellation-free expm1 form: tanh = em1 / (em1 + 2).
    const em1 = expm1Small(2 * ax);
    z = em1 / (em1 + 2);
  } else if (ax < 1) {
    // exp(2|x|) ≥ 1.41 here, so exp − 1 loses at most one bit.
    const em1 = exp(2 * ax) - 1;
    z = em1 / (em1 + 2);
  } else {
    // fdlibm form for |x| ≥ 1: no t − 1 cancellation, monotone as t grows, and
    // rounds to exactly 1 once 2/(t+1) < 2^-54 (|x| ≳ 18.4), like the true value.
    const t = exp(2 * ax);
    z = 1 - 2 / (t + 1);
  }
  return neg ? -z : z;
}

/** Deterministic Euclidean length √(x²+y²) (Math.hypot is not specified bit-exactly). */
export function hypot2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
