/**
 * Single typed home for all simulation constants (CLAUDE.md: no magic numbers
 * scattered in logic). Every value is documented with its unit.
 *
 * Units: meters, seconds, radians. See docs/CONVENTIONS.md.
 */

export interface PhysicsConfig {
  /** Fixed simulation timestep, seconds. Rendering framerate must never affect this. */
  readonly dt: number;
  /** Maximum forward speed, m/s. Speed is clamped to [0, vMax]. */
  readonly vMax: number;
  /** Full-throttle acceleration (and full-brake deceleration), m/s². */
  readonly accel: number;
  /** Linear drag coefficient, 1/s: each tick v *= (1 - drag·dt). Terminal speed accel/drag must exceed vMax. */
  readonly drag: number;
  /** Yaw rate at full steering and v = vMax, rad/s. Minimum turn radius = vMax / steerRate (speed-independent). */
  readonly steerRate: number;
  /** Car body length (along heading), meters. Used for collision corners and rendering. */
  readonly carLength: number;
  /** Car body width (across heading), meters. */
  readonly carWidth: number;
  /**
   * Grip limit (SPEC "optional refinement"): cap on lateral acceleration
   * v·ω, m/s². The commanded yaw rate is clamped to |ω| ≤ lateralAccelMax / v,
   * so at speed the car understeers — turn radius can't drop below v²/A —
   * unless it slows down. This is what makes braking and racing lines matter.
   * `null` disables the cap (the Slice 0–3 kinematic model).
   */
  readonly lateralAccelMax: number | null;
}

/**
 * Default arcade-model constants. Tuned by feel in Slice 0; final values are
 * reported at each slice's demo gate.
 *
 * With these numbers: terminal speed (accel/drag) = 40 m/s > vMax, so vMax is
 * reachable in ~4.6 s from rest; minimum turn radius = 30/2.5 = 12 m.
 */
export const DEFAULT_PHYSICS: PhysicsConfig = {
  dt: 1 / 60,
  vMax: 30,
  accel: 12,
  drag: 0.3,
  steerRate: 2.5,
  carLength: 4.0,
  carWidth: 1.8,
  // Corner speed for radius R is sqrt(A·R): 20 m/s² gives 19 m/s at R=18 and
  // 24.5 m/s at R=30, while 30 m/s needs R ≥ 45 m — flat-out cornering is out
  // on every corner of both tracks. Tuned on seed 42 (see PR #19): 12–18 left
  // the default seed stuck for 100 generations, 22–25 likewise; 20 laps.
  lateralAccelMax: 20,
};

/** The Slice 0–3 model without the grip limit; kept for tests and comparisons. */
export const NO_GRIP_PHYSICS: PhysicsConfig = { ...DEFAULT_PHYSICS, lateralAccelMax: null };

export interface SensorConfig {
  /**
   * Ray angles relative to the car's heading, radians. Negative = car's LEFT,
   * positive = car's RIGHT (same sign convention as steering). SPEC: 7 rays at
   * [−90°, −60°, −30°, 0°, +30°, +60°, +90°].
   */
  readonly angles: readonly number[];
  /** Maximum ray length, meters. Readings are distance / range, clamped to [0, 1]. */
  readonly range: number;
}

const DEG = Math.PI / 180;

export const DEFAULT_SENSORS: SensorConfig = {
  angles: [-90 * DEG, -60 * DEG, -30 * DEG, 0, 30 * DEG, 60 * DEG, 90 * DEG],
  // ~2 s of look-ahead at vMax; the longest straight on the training track is 80 m.
  range: 60,
};

export interface ProgressConfig {
  /** Target arc-length spacing between checkpoints along the centerline, meters. */
  readonly checkpointSpacing: number;
}

export const DEFAULT_PROGRESS: ProgressConfig = {
  checkpointSpacing: 5,
};

export interface EpisodeConfig {
  /** Episode length in simulated seconds; when reached the world stops advancing. */
  readonly seconds: number;
  /**
   * Stall rule (approved Slice 2 deviation from SPEC, sim-time based): a car
   * whose speed stays below `stallSpeed` for `stallSeconds` of simulated time
   * is marked dead (cause 'stall'). Its progress/fitness is unchanged — the
   * rule only stops idle cars from consuming the whole episode. `null`
   * disables it (Drive mode does this).
   */
  readonly stallSeconds: number | null;
  /** Speed threshold for the stall rule, m/s. */
  readonly stallSpeed: number;
}

export const DEFAULT_EPISODE: EpisodeConfig = {
  seconds: 30,
  stallSeconds: 3,
  stallSpeed: 0.5,
};

export interface FitnessConfig {
  /**
   * Lap-time bonus (SPEC): fitness = progress + lapBonus / bestLapSeconds for
   * cars that completed a lap, in metre·seconds. 2000 ⇒ a 20 s lap adds 100
   * "metres", a 15 s lap 133. Protects lap-finishing as a trait and rewards
   * lap time directly rather than 30 s throughput. 0 disables the bonus
   * (fitness = pure progress).
   */
  readonly lapBonus: number;
}

export const DEFAULT_FITNESS: FitnessConfig = { lapBonus: 2000 };

/** Everything the simulation needs to run one world (+ how it is scored). */
export interface SimConfig {
  readonly physics: PhysicsConfig;
  readonly sensors: SensorConfig;
  readonly progress: ProgressConfig;
  readonly episode: EpisodeConfig;
  readonly fitness: FitnessConfig;
}

export const DEFAULT_SIM: SimConfig = {
  physics: DEFAULT_PHYSICS,
  sensors: DEFAULT_SENSORS,
  progress: DEFAULT_PROGRESS,
  episode: DEFAULT_EPISODE,
  fitness: DEFAULT_FITNESS,
};

/** DEFAULT_SIM with the grip limit off (the Slice 0–3 model). Guarded by its own golden pins. */
export const NO_GRIP_SIM: SimConfig = { ...DEFAULT_SIM, physics: NO_GRIP_PHYSICS };

export interface NetworkTopology {
  readonly inputs: number;
  readonly hidden: number;
  readonly outputs: number;
}

/** SPEC: 8 inputs (7 rays + speed) → 10 tanh hidden → 2 tanh outputs (steering, throttle). */
export const DEFAULT_NN: NetworkTopology = { inputs: 8, hidden: 10, outputs: 2 };

export interface GaConfig {
  /** Number of genomes per generation (SPEC: 100). */
  readonly populationSize: number;
  /** Top-N genomes copied unchanged into the next generation (SPEC: 5). */
  readonly eliteCount: number;
  /** Tournament size for parent selection (SPEC: k = 4). */
  readonly tournamentK: number;
  /** Uniform per-gene crossover of two tournament parents when true; clone one parent when false. */
  readonly crossoverEnabled: boolean;
  /** Per-gene probability of mutation (SPEC: 0.1). */
  readonly mutationRate: number;
  /** Standard deviation of the Gaussian added to a mutated gene (SPEC: 0.2). */
  readonly mutationSigma: number;
  /** Standard deviation of the initial random genomes. */
  readonly initSigma: number;
}

/**
 * SPEC defaults. Crossover is OFF by default: mutation-only is the baseline
 * and the Slice 3 toggle + same-seed comparison is the A/B experiment.
 */
export const DEFAULT_GA: GaConfig = {
  populationSize: 100,
  eliteCount: 5,
  tournamentK: 4,
  crossoverEnabled: false,
  mutationRate: 0.1,
  mutationSigma: 0.2,
  initSigma: 1.0,
};

/**
 * The honesty benchmark (SPEC success criterion 1): on the training track with
 * DEFAULT_SIM / DEFAULT_GA / DEFAULT_NN and this seed, the first lap must
 * arrive at exactly this generation. The evolution test suite PINS this value;
 * any physics or GA change that moves it fails the test, which forces every
 * piece of UI copy that quotes it (the plateau hint) to be updated too — the
 * copy is derived from here, never typed as a literal.
 */
export const BENCHMARK = {
  seed: 42,
  firstLapGeneration: 60,
} as const;
