/**
 * Genome export/import format (SPEC: download/upload the best genome as JSON).
 *
 * The metadata is honest about reproducibility: `seed` + `ga` reproduce the
 * run that produced this genome ONLY when `modified` is false. A run becomes
 * modified by any mid-run knob change or genome import (see Evolution.modified),
 * and the export says so — never implying "this seed produces this genome"
 * when it does not.
 */

import type { GaConfig, NetworkTopology } from '../config.ts';
import { genomeFromJson, genomeLength, genomeToJson, type Genome } from './network.ts';

export const GENOME_FORMAT = 'apex-evolve-genome';
export const GENOME_FORMAT_VERSION = 1;

export interface GenomeExport {
  readonly format: typeof GENOME_FORMAT;
  readonly version: typeof GENOME_FORMAT_VERSION;
  readonly topology: NetworkTopology;
  readonly generation: number;
  readonly fitness: number;
  readonly seed: number | string;
  readonly ga: GaConfig;
  readonly modified: boolean;
  readonly track: string;
  readonly exportedAt: string;
  readonly genome: number[];
}

export interface GenomeExportInput {
  readonly genome: Genome;
  readonly topology: NetworkTopology;
  readonly generation: number;
  readonly fitness: number;
  readonly seed: number | string;
  readonly ga: GaConfig;
  readonly modified: boolean;
  readonly track: string;
  /** ISO timestamp; injected so sim/ stays free of wall-clock reads. */
  readonly exportedAt: string;
}

export function buildGenomeExport(input: GenomeExportInput): GenomeExport {
  if (input.genome.length !== genomeLength(input.topology)) {
    throw new Error('genome length does not match topology');
  }
  return {
    format: GENOME_FORMAT,
    version: GENOME_FORMAT_VERSION,
    topology: input.topology,
    generation: input.generation,
    fitness: input.fitness,
    seed: input.seed,
    ga: input.ga,
    modified: input.modified,
    track: input.track,
    exportedAt: input.exportedAt,
    genome: genomeToJson(input.genome),
  };
}

export interface ParsedGenome {
  readonly genome: Genome;
  readonly topology: NetworkTopology;
  readonly generation: number | null;
  readonly fitness: number | null;
  readonly modified: boolean | null;
}

function isTopology(v: unknown): v is NetworkTopology {
  return (
    typeof v === 'object' &&
    v !== null &&
    'inputs' in v &&
    'hidden' in v &&
    'outputs' in v &&
    typeof v.inputs === 'number' &&
    typeof v.hidden === 'number' &&
    typeof v.outputs === 'number'
  );
}

/**
 * Parse an uploaded JSON document. Accepts the full export object or a bare
 * genome array (assumed to be for `expected` topology). Throws descriptive
 * errors; the topology must match `expected`.
 */
export function parseGenomeExport(raw: unknown, expected: NetworkTopology): ParsedGenome {
  if (Array.isArray(raw)) {
    return {
      genome: genomeFromJson(expected, raw),
      topology: expected,
      generation: null,
      fitness: null,
      modified: null,
    };
  }
  if (typeof raw !== 'object' || raw === null)
    throw new Error('genome file: expected a JSON object');
  const format = 'format' in raw ? raw.format : undefined;
  if (format !== GENOME_FORMAT) throw new Error(`genome file: unknown format ${String(format)}`);
  const topology = 'topology' in raw ? raw.topology : undefined;
  if (!isTopology(topology)) throw new Error('genome file: missing topology');
  if (
    topology.inputs !== expected.inputs ||
    topology.hidden !== expected.hidden ||
    topology.outputs !== expected.outputs
  ) {
    throw new Error(
      `genome file: topology ${topology.inputs}→${topology.hidden}→${topology.outputs} does not match ${expected.inputs}→${expected.hidden}→${expected.outputs}`,
    );
  }
  const genome = genomeFromJson(expected, 'genome' in raw ? raw.genome : undefined);
  const generation =
    'generation' in raw && typeof raw.generation === 'number' ? raw.generation : null;
  const fitness = 'fitness' in raw && typeof raw.fitness === 'number' ? raw.fitness : null;
  const modified = 'modified' in raw && typeof raw.modified === 'boolean' ? raw.modified : null;
  return { genome, topology: expected, generation, fitness, modified };
}
