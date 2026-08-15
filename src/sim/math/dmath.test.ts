import { describe, expect, it } from 'vitest';
import { atan, atan2, cos, exp, hypot2, sin, tanh } from './dmath.ts';

/** Units in the last place between two doubles (a is the reference). */
function ulps(a: number, b: number): number {
  if (a === b) return 0;
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, a);
  const ia = buf.getBigInt64(0);
  buf.setFloat64(0, b);
  const ib = buf.getBigInt64(0);
  return Number(ia > ib ? ia - ib : ib - ia);
}

function sweep(from: number, to: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(from + ((to - from) * i) / n);
  return out;
}

describe('dmath.sin / cos — accuracy vs the engine (this only checks closeness; identity across engines is the golden test)', () => {
  it('agree with Math.sin/cos to ≤ 2 ulp across [−100, 100]', () => {
    for (const x of sweep(-100, 100, 20000)) {
      expect(ulps(Math.sin(x), sin(x))).toBeLessThanOrEqual(2);
      expect(ulps(Math.cos(x), cos(x))).toBeLessThanOrEqual(2);
    }
  });

  it('agree with Math.sin/cos to ≤ 4 ulp on large arguments up to 1e5 rad', () => {
    for (const x of sweep(-1e5, 1e5, 20000)) {
      expect(ulps(Math.sin(x), sin(x))).toBeLessThanOrEqual(4);
      expect(ulps(Math.cos(x), cos(x))).toBeLessThanOrEqual(4);
    }
  });

  it('are exactly odd / even (bit-exact symmetry)', () => {
    for (const x of sweep(0.001, 50, 5000)) {
      expect(Object.is(sin(-x), -sin(x))).toBe(true);
      expect(Object.is(cos(-x), cos(x))).toBe(true);
    }
  });

  it('special values', () => {
    expect(Object.is(sin(0), 0)).toBe(true);
    expect(Object.is(sin(-0), -0)).toBe(true);
    expect(cos(0)).toBe(1);
    expect(sin(1e-9)).toBe(1e-9);
    expect(cos(1e-9)).toBe(1);
    expect(sin(Math.PI / 2)).toBe(1);
    expect(cos(Math.PI)).toBe(-1);
    expect(sin(NaN)).toBeNaN();
    expect(cos(Infinity)).toBeNaN();
    expect(sin(-Infinity)).toBeNaN();
  });

  it('satisfy sin² + cos² = 1 to 1e-15 on a dense sweep', () => {
    for (const x of sweep(-30, 30, 6001)) {
      expect(Math.abs(sin(x) ** 2 + cos(x) ** 2 - 1)).toBeLessThan(1e-15);
    }
  });
});

describe('dmath.atan / atan2', () => {
  it('atan agrees with Math.atan to ≤ 2 ulp over a wide range', () => {
    for (const x of [...sweep(-10, 10, 20000), ...sweep(-1e6, 1e6, 2000), 1e20, -1e20, 1e100]) {
      expect(ulps(Math.atan(x), atan(x))).toBeLessThanOrEqual(2);
    }
  });

  it('atan2 agrees with Math.atan2 to ≤ 2 ulp on a grid over all quadrants', () => {
    for (const y of sweep(-5, 5, 101)) {
      for (const x of sweep(-5, 5, 101)) {
        if (x === 0 && y === 0) continue;
        expect(ulps(Math.atan2(y, x), atan2(y, x))).toBeLessThanOrEqual(2);
      }
    }
  });

  it('atan2 special cases (C99 conventions)', () => {
    expect(Object.is(atan2(0, 1), 0)).toBe(true);
    expect(Object.is(atan2(-0, 1), -0)).toBe(true);
    expect(atan2(0, -1)).toBe(Math.PI);
    expect(atan2(-0, -1)).toBe(-Math.PI);
    expect(atan2(1, 0)).toBe(Math.PI / 2);
    expect(atan2(-1, 0)).toBe(-Math.PI / 2);
    expect(atan2(1, 1)).toBe(Math.PI / 4);
    expect(atan2(1, Infinity)).toBe(0);
    expect(atan2(1, -Infinity)).toBe(Math.PI);
    expect(atan2(Infinity, Infinity)).toBe(Math.PI / 4);
    expect(atan2(-Infinity, -Infinity)).toBe((-3 * Math.PI) / 4);
    expect(atan2(Infinity, 3)).toBe(Math.PI / 2);
    expect(atan2(NaN, 1)).toBeNaN();
    expect(atan2(1, NaN)).toBeNaN();
  });

  it('atan2 under the y-down convention: (x=0, y=1) → +π/2 (clockwise on screen)', () => {
    expect(atan2(1, 0)).toBeCloseTo(Math.PI / 2, 15);
    // Round trip with sin/cos for a sweep of headings in (−π, π].
    for (const h of sweep(-3.1, 3.1, 621)) {
      expect(atan2(sin(h), cos(h))).toBeCloseTo(h, 14);
    }
  });
});

describe('dmath.exp / tanh', () => {
  it('exp agrees with Math.exp to ≤ 2 ulp on [−700, 700]', () => {
    for (const x of [...sweep(-700, 700, 14001), ...sweep(-1, 1, 4001)]) {
      expect(ulps(Math.exp(x), exp(x))).toBeLessThanOrEqual(2);
    }
  });

  it('exp special values', () => {
    expect(exp(0)).toBe(1);
    expect(exp(1e-10)).toBe(1 + 1e-10);
    expect(exp(Infinity)).toBe(Infinity);
    expect(exp(-Infinity)).toBe(0);
    expect(exp(710)).toBe(Infinity);
    expect(exp(-750)).toBe(0);
    expect(exp(NaN)).toBeNaN();
    expect(ulps(Math.E, exp(1))).toBeLessThanOrEqual(1); // fdlibm's exp(1) is 1 ulp above the correctly rounded e
  });

  it('tanh agrees with Math.tanh to ≤ 4 ulp on [−25, 25]', () => {
    for (const x of [
      ...sweep(-25, 25, 20001),
      ...sweep(-0.2, 0.2, 4001),
      ...sweep(-1e-6, 1e-6, 201),
    ]) {
      expect(ulps(Math.tanh(x), tanh(x))).toBeLessThanOrEqual(4);
    }
  });

  it('tanh saturates to EXACTLY ±1 for large |x| and is exactly odd', () => {
    for (const x of [22, 25, 50, 100, 1e6, 1e300, Infinity]) {
      expect(Object.is(tanh(x), 1)).toBe(true);
      expect(Object.is(tanh(-x), -1)).toBe(true);
    }
    expect(Object.is(tanh(0), 0)).toBe(true);
    expect(Object.is(tanh(-0), -0)).toBe(true);
    for (const x of sweep(0.001, 21, 2100)) expect(Object.is(tanh(-x), -tanh(x))).toBe(true);
    expect(tanh(NaN)).toBeNaN();
  });

  it('tanh is monotone non-decreasing and strictly inside (−1, 1) for |x| ≤ 18', () => {
    // 1 − tanh(18) ≈ 4.6e-16 is still representable below 1; from |x| ≈ 18.4 the
    // true value rounds to exactly ±1 (as it does for Math.tanh).
    let prev = -1;
    for (const x of sweep(-25, 25, 50000)) {
      const v = tanh(x);
      expect(v).toBeGreaterThanOrEqual(prev);
      if (Math.abs(x) <= 18) {
        expect(v).toBeGreaterThan(-1);
        expect(v).toBeLessThan(1);
      }
      prev = v;
    }
  });
});

describe('dmath.hypot2', () => {
  it('is √(x²+y²)', () => {
    expect(hypot2(3, 4)).toBe(5);
    expect(hypot2(0, 0)).toBe(0);
    expect(hypot2(-1, 0)).toBe(1);
  });
});

/**
 * GOLDEN PINS — the actual determinism guarantee. These exact doubles were
 * produced on macOS/arm64 (Node 26) and must be reproduced bit-for-bit on CI
 * (Linux/x64, Node 22) and in every browser. If one of these ever fails on a
 * platform, that platform's IEEE basic arithmetic or Math.sqrt is not
 * behaving as assumed — investigate; do not re-pin.
 */
const GOLDEN: ReadonlyArray<readonly [label: string, expected: number, actual: number]> = [
  ['sin(0.5)', 0.479425538604203, sin(0.5)],
  ['cos(0.5)', 0.8775825618903728, cos(0.5)],
  ['sin(1)', 0.8414709848078965, sin(1)],
  ['cos(1)', 0.5403023058681398, cos(1)],
  ['sin(2)', 0.9092974268256817, sin(2)],
  ['cos(2)', -0.4161468365471424, cos(2)],
  ['sin(3)', 0.1411200080598672, sin(3)],
  ['cos(3)', -0.9899924966004454, cos(3)],
  ['sin(10)', -0.5440211108893699, sin(10)],
  ['cos(10)', -0.8390715290764524, cos(10)],
  ['sin(100)', -0.5063656411097588, sin(100)],
  ['cos(100)', 0.8623188722876839, cos(100)],
  ['sin(12345.678)', -0.7040813137533816, sin(12345.678)],
  ['cos(12345.678)', 0.7101193587160628, cos(12345.678)],
  ['sin(-7.25)', -0.8230808790115054, sin(-7.25)],
  ['cos(-7.25)', 0.5679241732886949, cos(-7.25)],
  ['sin(100000)', 0.03574879797201651, sin(100000)],
  ['cos(100000)', -0.9993608074382124, cos(100000)],
  ['sin(987654.321)', 0.4101006722354487, sin(987654.321)],
  ['cos(987654.321)', 0.9120402615192122, cos(987654.321)],
  ['sin(0.7853981633974483)', 0.7071067811865475, sin(0.7853981633974483)],
  ['cos(0.7853981633974483)', 0.7071067811865476, cos(0.7853981633974483)],
  ['sin(1.5707963267948966)', 1, sin(1.5707963267948966)],
  ['cos(1.5707963267948966)', 6.123233995736766e-17, cos(1.5707963267948966)],
  ['sin(3.141592653589793)', 1.2246467991473532e-16, sin(3.141592653589793)],
  ['cos(3.141592653589793)', -1, cos(3.141592653589793)],
  ['atan(0.25)', 0.24497866312686414, atan(0.25)],
  ['atan(0.5)', 0.4636476090008061, atan(0.5)],
  ['atan(1.5)', 0.982793723247329, atan(1.5)],
  ['atan(3)', 1.2490457723982544, atan(3)],
  ['atan(-0.7)', -0.6107259643892086, atan(-0.7)],
  ['atan(1000000)', 1.5707953267948966, atan(1000000)],
  ['atan2(1, 2)', 0.4636476090008061, atan2(1, 2)],
  ['atan2(-1, 2)', -0.4636476090008061, atan2(-1, 2)],
  ['atan2(1, -2)', 2.677945044588987, atan2(1, -2)],
  ['atan2(-1, -2)', -2.677945044588987, atan2(-1, -2)],
  ['atan2(3, 0.1)', 1.5374753309166493, atan2(3, 0.1)],
  ['atan2(0.5, -0.0001)', 1.57099632679223, atan2(0.5, -0.0001)],
  ['atan2(-4, -3)', -2.214297435588181, atan2(-4, -3)],
  ['exp(-3.5)', 0.0301973834223185, exp(-3.5)],
  ['exp(0.3)', 1.3498588075760032, exp(0.3)],
  ['exp(1)', 2.7182818284590455, exp(1)],
  ['exp(5.5)', 244.69193226422038, exp(5.5)],
  ['exp(100)', 2.6881171418161356e43, exp(100)],
  ['exp(-20)', 2.061153622438558e-9, exp(-20)],
  ['exp(0.5)', 1.6487212707001282, exp(0.5)],
  ['exp(-0.25)', 0.7788007830714049, exp(-0.25)],
  ['exp(700)', 1.0142320547350045e304, exp(700)],
  ['tanh(-2)', -0.9640275800758169, tanh(-2)],
  ['tanh(0.1)', 0.09966799462495583, tanh(0.1)],
  ['tanh(0.5)', 0.4621171572600098, tanh(0.5)],
  ['tanh(3)', 0.9950547536867305, tanh(3)],
  ['tanh(22)', 1, tanh(22)],
  ['tanh(100)', 1, tanh(100)],
  ['tanh(1e-8)', 9.999999999999999e-9, tanh(1e-8)],
  ['tanh(0.17)', 0.16838104587081473, tanh(0.17)],
  ['tanh(0.18)', 0.17808086811733023, tanh(0.18)],
  ['tanh(-1.234)', -0.8437356625893302, tanh(-1.234)],
  ['tanh(5e-9)', 5.000000000000001e-9, tanh(5e-9)],
];

describe('dmath golden pins (bit-exact across engines)', () => {
  it.each(GOLDEN)('%s === %s', (_label, expected, actual) => {
    expect(Object.is(actual, expected)).toBe(true);
  });
});
