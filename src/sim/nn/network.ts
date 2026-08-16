/**
 * Fixed-topology feedforward network — forward pass only (SPEC "Neural
 * network"). No training code lives here; the GA is the trainer.
 *
 *   inputs (8) → hidden (10, tanh) → outputs (2, tanh)
 *
 * Genome = one flat Float32Array holding every weight and bias, laid out as:
 *   [ W1: hidden × inputs (row per hidden neuron: w[h·inputs + i]),
 *     b1: hidden,
 *     W2: outputs × hidden (row per output: w[o·hidden + h]),
 *     b2: outputs ]
 * For 8→10→2 that is 80 + 10 + 20 + 2 = 112 parameters.
 *
 * Determinism: weights are float32 (Float32Array rounds on store — exactly
 * specified); the multiply-adds run in float64; activation is dmath.tanh. So
 * `forward` is bit-identical across engines. It allocates nothing: the caller
 * supplies the output array and a scratch buffer from `createScratch`.
 *
 * Output mapping (SPEC): out[0] = steering ∈ [−1, 1], out[1] = throttle ∈ [−1, 1].
 */

import type { NetworkTopology } from '../config.ts';
import { tanh } from '../math/dmath.ts';
import type { Prng } from '../random/prng.ts';

export type Genome = Float32Array;

/** Number of parameters for a topology. */
export function genomeLength(t: NetworkTopology): number {
  return t.inputs * t.hidden + t.hidden + t.hidden * t.outputs + t.outputs;
}

/** Offsets of each block in the flat genome. */
export function genomeLayout(t: NetworkTopology): {
  readonly w1: number;
  readonly b1: number;
  readonly w2: number;
  readonly b2: number;
  readonly length: number;
} {
  const w1 = 0;
  const b1 = w1 + t.inputs * t.hidden;
  const w2 = b1 + t.hidden;
  const b2 = w2 + t.hidden * t.outputs;
  return { w1, b1, w2, b2, length: b2 + t.outputs };
}

/** Scratch space for one forward pass (reusable across calls and genomes). */
export function createScratch(t: NetworkTopology): Float64Array {
  return new Float64Array(t.hidden);
}

/**
 * Forward pass. `inputs.length` must equal t.inputs and `out.length`
 * t.outputs; `genome.length` must equal genomeLength(t). Writes into `out`.
 */
export function forward(
  t: NetworkTopology,
  genome: Genome,
  inputs: ArrayLike<number>,
  out: Float64Array | number[],
  scratch: Float64Array,
): void {
  const { inputs: nIn, hidden: nHid, outputs: nOut } = t;
  if (genome.length !== genomeLength(t)) {
    throw new Error(`genome length ${genome.length} ≠ ${genomeLength(t)} for topology`);
  }
  if (inputs.length !== nIn) throw new Error(`expected ${nIn} inputs, got ${inputs.length}`);
  if (out.length !== nOut) throw new Error(`expected out of length ${nOut}, got ${out.length}`);
  if (scratch.length < nHid) throw new Error('scratch too small');
  const b1 = nIn * nHid;
  const w2 = b1 + nHid;
  const b2 = w2 + nHid * nOut;
  for (let h = 0; h < nHid; h++) {
    let acc = genome[b1 + h] ?? 0;
    const row = h * nIn;
    for (let i = 0; i < nIn; i++) acc += (genome[row + i] ?? 0) * (inputs[i] ?? 0);
    scratch[h] = tanh(acc);
  }
  for (let o = 0; o < nOut; o++) {
    let acc = genome[b2 + o] ?? 0;
    const row = w2 + o * nHid;
    for (let h = 0; h < nHid; h++) acc += (genome[row + h] ?? 0) * (scratch[h] ?? 0);
    out[o] = tanh(acc);
  }
}

/** Genome with every parameter drawn from N(0, sigma). */
export function randomGenome(t: NetworkTopology, rng: Prng, sigma: number): Genome {
  const g = new Float32Array(genomeLength(t));
  for (let i = 0; i < g.length; i++) g[i] = rng.nextGaussian(0, sigma);
  return g;
}

/** Plain-number copy for JSON export. */
export function genomeToJson(g: Genome): number[] {
  return Array.from(g);
}

/** Validate and load a genome from JSON numbers (throws on wrong length / non-finite). */
export function genomeFromJson(t: NetworkTopology, raw: unknown): Genome {
  if (!Array.isArray(raw)) throw new Error('genome: expected an array');
  const n = genomeLength(t);
  if (raw.length !== n) throw new Error(`genome: expected ${n} numbers, got ${raw.length}`);
  const g = new Float32Array(n);
  raw.forEach((v: unknown, i: number) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
      throw new Error(`genome[${i}] is not a finite number`);
    g[i] = v;
  });
  return g;
}
