import { useRef, useState } from 'react';
import { DEFAULT_GA, DEFAULT_NN } from '../sim/config.ts';
import { injectGenome, setGaConfig, type Evolution } from '../sim/engine/evolution.ts';
import { buildGenomeExport, parseGenomeExport } from '../sim/nn/genomeIo.ts';
import { parseSeed, useUiStore } from './store.ts';

/**
 * Run controls (SPEC): restart with seed input, live mutation-rate slider and
 * crossover toggle, export/import of the best genome. Any live knob change or
 * import marks the run "modified" (Evolution.modified) — shown here and
 * stamped into exports.
 */
export function RunControls({
  evolution,
  onRestart,
}: {
  /** The live evolution (mutable; knob changes are applied through setGaConfig). */
  evolution: Evolution | null;
  /** Restart the run with the current store seed + knobs. */
  onRestart: () => void;
}) {
  const seed = useUiStore((s) => s.seed);
  const mutationRate = useUiStore((s) => s.mutationRate);
  const crossoverEnabled = useUiStore((s) => s.crossoverEnabled);
  const notice = useUiStore((s) => s.notice);
  const { setSeed, setMutationRate, setCrossoverEnabled, setNotice, setSelection } =
    useUiStore.getState();
  const [seedText, setSeedText] = useState(String(seed));
  const fileRef = useRef<HTMLInputElement | null>(null);

  const applyKnobs = (rate: number, crossover: boolean) => {
    if (!evolution) return;
    setGaConfig(evolution, {
      ...evolution.cfg.ga,
      mutationRate: rate,
      crossoverEnabled: crossover,
    });
  };

  const restartWithSeed = () => {
    const s = parseSeed(seedText);
    setSeed(s);
    setSeedText(String(s));
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', String(s));
      window.history.replaceState(null, '', url.toString());
    }
    setNotice(null);
    onRestart();
  };

  const exportBest = () => {
    if (!evolution || !evolution.bestEver) {
      setNotice('Nothing to export yet — wait for the first generation to finish.');
      return;
    }
    const doc = buildGenomeExport({
      genome: evolution.bestEver.genome,
      topology: evolution.cfg.nn,
      generation: evolution.bestEver.generation,
      fitness: evolution.bestEver.fitness,
      seed: evolution.cfg.seed,
      ga: evolution.cfg.ga,
      modified: evolution.modified,
      track: evolution.track.name,
      exportedAt: new Date().toISOString(),
    });
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex-evolve-genome-seed${String(doc.seed)}-gen${doc.generation}${doc.modified ? '-modified' : ''}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setNotice(
      `Exported best genome (gen ${doc.generation}, ${doc.fitness.toFixed(1)} m${doc.modified ? ', run modified' : ''}).`,
    );
  };

  const importFile = async (file: File) => {
    if (!evolution) return;
    try {
      const parsed = parseGenomeExport(JSON.parse(await file.text()), DEFAULT_NN);
      injectGenome(evolution, parsed.genome, 0);
      setSelection({ index: 0, generation: evolution.generation });
      const meta =
        parsed.generation !== null
          ? ` (from gen ${parsed.generation}${parsed.fitness !== null ? `, ${parsed.fitness.toFixed(1)} m` : ''})`
          : '';
      setNotice(
        `Imported genome${meta} as car #0 — episode restarted, car #0 selected. Run is now modified.`,
      );
    } catch (err) {
      setNotice(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <section className="run" aria-label="Run controls">
      <h2 className="hud__title">
        Run{' '}
        {evolution?.modified ? (
          <span
            className="badge badge--warn"
            title="Knobs changed or a genome was imported mid-run: the seed alone no longer reproduces this run."
          >
            modified
          </span>
        ) : (
          <span
            className="badge"
            title="This run is a pure function of the seed and the starting config."
          >
            reproducible
          </span>
        )}
      </h2>
      <div className="run__row">
        <label className="inspector__label" htmlFor="seed">
          Seed
        </label>
        <input
          id="seed"
          className="run__input"
          value={seedText}
          onChange={(e) => setSeedText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') restartWithSeed();
            e.stopPropagation();
          }}
          spellCheck={false}
          aria-label="Seed (number or text)"
        />
        <button
          type="button"
          onClick={restartWithSeed}
          title="Restart the run with this seed (Enter)"
        >
          Restart
        </button>
      </div>
      <div className="run__row">
        <label className="inspector__label" htmlFor="mut">
          Mutation rate
        </label>
        <input
          id="mut"
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={mutationRate}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMutationRate(v);
            applyKnobs(v, crossoverEnabled);
          }}
          aria-valuetext={`${mutationRate.toFixed(2)} per gene`}
        />
        <span className="inspector__val">{mutationRate.toFixed(2)}</span>
      </div>
      <div className="run__row">
        <label className="inspector__label" htmlFor="xo">
          Crossover
        </label>
        <input
          id="xo"
          type="checkbox"
          checked={crossoverEnabled}
          onChange={(e) => {
            setCrossoverEnabled(e.target.checked);
            applyKnobs(mutationRate, e.target.checked);
          }}
        />
        <span className="inspector__val">{crossoverEnabled ? 'on' : 'off'}</span>
      </div>
      <p className="hud__conv">
        Knobs apply at the next generation. Changing them mid-run (or importing a genome) marks the
        run modified: the seed alone no longer reproduces it. Defaults: mutation{' '}
        {DEFAULT_GA.mutationRate}, crossover {DEFAULT_GA.crossoverEnabled ? 'on' : 'off'}.
      </p>
      <div className="controls">
        <button type="button" onClick={exportBest}>
          Export best genome (JSON)
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import genome…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {notice && (
        <p className="run__notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
