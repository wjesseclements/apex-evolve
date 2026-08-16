import { BENCHMARK } from '../sim/config.ts';

/**
 * The cold-visitor explainer: what is on screen, what the colours mean, and
 * three preset runs. Collapsible so regulars can hide it; open by default.
 */
export function Explainer() {
  return (
    <details className="explainer" open>
      <summary className="explainer__summary">What am I looking at?</summary>
      <p>
        <strong>100 cars are learning to drive this track.</strong> Each is steered by a tiny neural
        network that sees only 7 wall distances and its speed. Nobody programs the driving: after
        each 30 s run the best 5 networks survive, the rest are replaced by mutated copies of
        winners — and the next generation goes again.
      </p>
      <p className="explainer__legend">
        <span className="swatch swatch--leader" /> leader (rays = its sensors) ·{' '}
        <span className="swatch swatch--alive" /> alive · <span className="swatch swatch--dead" />{' '}
        crashed · click any car to inspect it
      </p>
      <p className="explainer__presets">
        Try: <a href={`?seed=${BENCHMARK.seed}`}>the benchmark seed {BENCHMARK.seed}</a> (stuck
        until generation {BENCHMARK.firstLapGeneration}, then a breakthrough) ·{' '}
        <a href="?seed=43">a fast learner</a> · <a href="?seed=42&crossover=1">crossover on</a>{' '}
        (escapes the plateau ~50 generations earlier) ·{' '}
        <a href="?seed=43&track=heldout">the held-out track</a>
      </p>
    </details>
  );
}
