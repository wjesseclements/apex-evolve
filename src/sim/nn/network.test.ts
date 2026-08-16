import { describe, expect, it } from 'vitest';
import { DEFAULT_NN, type NetworkTopology } from '../config.ts';
import { createPrng } from '../random/prng.ts';
import {
  createScratch,
  forward,
  genomeFromJson,
  genomeLayout,
  genomeLength,
  genomeToJson,
  randomGenome,
} from './network.ts';

const TINY: NetworkTopology = { inputs: 2, hidden: 2, outputs: 1 };

describe('genome layout', () => {
  it('SPEC topology 8→10→2 has 112 parameters with the documented block offsets', () => {
    expect(genomeLength(DEFAULT_NN)).toBe(112);
    expect(genomeLayout(DEFAULT_NN)).toEqual({ w1: 0, b1: 80, w2: 90, b2: 110, length: 112 });
  });

  it('general formula: in·hid + hid + hid·out + out', () => {
    expect(genomeLength(TINY)).toBe(2 * 2 + 2 + 2 * 1 + 1);
    expect(genomeLength({ inputs: 3, hidden: 5, outputs: 4 })).toBe(15 + 5 + 20 + 4);
  });
});

describe('forward — hand-computed', () => {
  it('2→2→1: matches a by-hand evaluation', () => {
    // Layout: W1 (2×2 row-major) = [1, 2, -1, 0.5], b1 = [0.1, -0.2], W2 (1×2) = [0.7, -1.5], b2 = [0.05]
    const g = new Float32Array([1, 2, -1, 0.5, 0.1, -0.2, 0.7, -1.5, 0.05]);
    const x = [0.3, -0.4];
    // Weights live in float32: the by-hand reference must use the rounded values too.
    const f = Math.fround;
    const h0 = Math.tanh(f(0.1) + 1 * 0.3 + 2 * -0.4);
    const h1 = Math.tanh(f(-0.2) + -1 * 0.3 + f(0.5) * -0.4);
    const y = Math.tanh(f(0.05) + f(0.7) * h0 + f(-1.5) * h1);
    const out = new Float64Array(1);
    forward(TINY, g, x, out, createScratch(TINY));
    expect(out[0]).toBeCloseTo(y, 12);
  });

  it('8→10→2 with a hand-set genome: only hidden 3 and output 1 are wired', () => {
    const g = new Float32Array(112);
    // hidden 3 gets weight 2 from input 5 and bias −0.5; output 1 gets weight 1.25 from hidden 3, bias 0.
    g[3 * 8 + 5] = 2;
    g[80 + 3] = -0.5;
    g[90 + 1 * 10 + 3] = 1.25;
    const inputs = [0, 0, 0, 0, 0, 0.75, 0, 0];
    const out = new Float64Array(2);
    forward(DEFAULT_NN, g, inputs, out, createScratch(DEFAULT_NN));
    const h3 = Math.tanh(-0.5 + 2 * 0.75);
    expect(out[0]).toBe(0); // untouched output: tanh(0)
    expect(out[1]).toBeCloseTo(Math.tanh(1.25 * h3), 12);
  });

  it('zero genome ⇒ zero outputs for any input', () => {
    const out = new Float64Array(2);
    forward(
      DEFAULT_NN,
      new Float32Array(112),
      [1, 0.5, 0.2, 0.9, 1, 1, 0, 0.3],
      out,
      createScratch(DEFAULT_NN),
    );
    expect(Array.from(out)).toEqual([0, 0]);
  });

  it('outputs stay within [−1, 1] for random genomes and inputs', () => {
    const rng = createPrng(3);
    const out = new Float64Array(2);
    const scratch = createScratch(DEFAULT_NN);
    for (let k = 0; k < 200; k++) {
      const g = randomGenome(DEFAULT_NN, rng, 3);
      const inputs = Array.from({ length: 8 }, () => rng.nextFloat());
      forward(DEFAULT_NN, g, inputs, out, scratch);
      for (const v of out) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is pure and reusable: repeated calls with the same inputs give identical outputs and do not touch the genome', () => {
    const rng = createPrng(11);
    const g = randomGenome(DEFAULT_NN, rng, 1);
    const copy = new Float32Array(g);
    const inputs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const a = new Float64Array(2);
    const b = new Float64Array(2);
    const scratch = createScratch(DEFAULT_NN);
    forward(DEFAULT_NN, g, inputs, a, scratch);
    forward(DEFAULT_NN, g, [1, 1, 1, 1, 1, 1, 1, 1], b, scratch); // dirty the scratch
    forward(DEFAULT_NN, g, inputs, b, scratch);
    expect(Array.from(b)).toEqual(Array.from(a));
    expect(Array.from(g)).toEqual(Array.from(copy));
  });

  it('rejects mismatched sizes', () => {
    const out = new Float64Array(2);
    expect(() =>
      forward(
        DEFAULT_NN,
        new Float32Array(10),
        new Array(8).fill(0),
        out,
        createScratch(DEFAULT_NN),
      ),
    ).toThrow();
    expect(() =>
      forward(DEFAULT_NN, new Float32Array(112), [1, 2], out, createScratch(DEFAULT_NN)),
    ).toThrow();
    expect(() =>
      forward(
        DEFAULT_NN,
        new Float32Array(112),
        new Array(8).fill(0),
        new Float64Array(1),
        createScratch(DEFAULT_NN),
      ),
    ).toThrow();
  });
});

describe('randomGenome / JSON codec', () => {
  it('randomGenome draws every parameter (none left at 0) with the requested spread, deterministically', () => {
    const g1 = randomGenome(DEFAULT_NN, createPrng(9), 1);
    const g2 = randomGenome(DEFAULT_NN, createPrng(9), 1);
    expect(Array.from(g1)).toEqual(Array.from(g2));
    expect(g1.length).toBe(112);
    expect(Array.from(g1).filter((v) => v === 0)).toHaveLength(0);
    const sd = Math.sqrt(Array.from(g1).reduce((s, v) => s + v * v, 0) / 112);
    expect(sd).toBeGreaterThan(0.6);
    expect(sd).toBeLessThan(1.5);
  });

  it('JSON round trip is bit-exact (float32 values survive as JS numbers)', () => {
    const g = randomGenome(DEFAULT_NN, createPrng(21), 0.7);
    const json = JSON.parse(JSON.stringify(genomeToJson(g)));
    const back = genomeFromJson(DEFAULT_NN, json);
    expect(Array.from(back)).toEqual(Array.from(g));
  });

  it('genomeFromJson validates shape and values', () => {
    expect(() => genomeFromJson(DEFAULT_NN, 'nope')).toThrow('array');
    expect(() => genomeFromJson(DEFAULT_NN, [1, 2, 3])).toThrow('112');
    const bad = new Array(112).fill(0);
    bad[5] = 'x';
    expect(() => genomeFromJson(DEFAULT_NN, bad)).toThrow('genome[5]');
    bad[5] = Infinity;
    expect(() => genomeFromJson(DEFAULT_NN, bad)).toThrow('genome[5]');
  });
});

describe('golden forward pass (bit-exact across engines)', () => {
  it('seed 42 genome, fixed inputs', () => {
    const g = randomGenome(DEFAULT_NN, createPrng(42), 1);
    const out = new Float64Array(2);
    forward(
      DEFAULT_NN,
      g,
      [0.1, 0.12, 0.2, 1, 0.2, 0.12, 0.1, 0.5],
      out,
      createScratch(DEFAULT_NN),
    );
    expect(Array.from(out)).toEqual(GOLDEN_OUT);
    expect(g[0]).toBe(GOLDEN_G0);
  });
});

const GOLDEN_OUT: number[] = [-0.8608279507672649, 0.9999063517328363];
const GOLDEN_G0 = -1.2848381996154785;
