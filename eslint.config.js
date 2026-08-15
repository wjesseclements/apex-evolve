// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * Names that must never appear in src/sim/**. sim/ is pure and headless: it
 * runs under Vitest in Node and must be independent of the browser, timers,
 * and wall-clock time so that fixed-timestep simulation is reproducible.
 */
const SIM_BANNED_GLOBALS = [
  'window',
  'document',
  'navigator',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'performance',
  'localStorage',
  'sessionStorage',
  'fetch',
  'HTMLCanvasElement',
  'CanvasRenderingContext2D',
  'Image',
].map((name) => ({
  name,
  message: `sim/ is pure and headless: '${name}' is not allowed (CLAUDE.md hard rule 2).`,
}));

/**
 * Math functions whose results are engine-dependent (ECMA-262 only requires
 * "implementation-approximated" values). sim/ must use src/sim/math/dmath.ts.
 * Allowed: sqrt (hardware IEEE, correctly rounded everywhere), abs, floor,
 * ceil, round, trunc, sign, min, max, fround, PI, and friends.
 */
const SIM_BANNED_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'pow', 'hypot', 'cbrt',
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },

  // ---------------------------------------------------------------- baseline
  {
    files: ['**/*.{ts,tsx,js}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Named exports only (CLAUDE.md code conventions).
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports only (CLAUDE.md).',
        },
      ],
      eqeqeq: ['error', 'always'],
    },
  },

  // Vite/vitest config files must default-export; that is the tool contract.
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // -------------------------------------------------------------- ui / render
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // render/ depends on sim/ only — never on ui/ or React.
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*'], message: 'render/ must not depend on React.' },
            { group: ['**/ui/**'], message: 'render/ must not depend on ui/.' },
          ],
        },
      ],
    },
  },

  // -------------------------------------------------------------- sim purity
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...SIM_BANNED_GLOBALS],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Determinism is sacred: use the injected seeded PRNG (CLAUDE.md hard rule 1).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'sim/ must not read wall-clock time (CLAUDE.md hard rule 2/3).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*'], message: 'sim/ must not import React.' },
            { group: ['**/render/**', '**/ui/**'], message: 'sim/ must not depend on render/ or ui/.' },
          ],
        },
      ],
    },
  },
  {
    // Production sim code: no `as` casts and no non-null assertions.
    // Test files may be looser (CLAUDE.md code conventions).
    files: ['src/sim/**/*.ts'],
    ignores: ['src/sim/**/*.test.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Transcendentals are not bit-identical across JS engines; sim/ uses
      // src/sim/math/dmath.ts (deterministic fdlibm-derived kernels) instead.
      // Test files may call Math.* as the reference to compare against.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Determinism is sacred: use the injected seeded PRNG (CLAUDE.md hard rule 1).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'sim/ must not read wall-clock time (CLAUDE.md hard rule 2/3).',
        },
        ...SIM_BANNED_MATH.map((property) => ({
          object: 'Math',
          property,
          message: `Math.${property} is not deterministic across engines: use sim/math/dmath.ts.`,
        })),
      ],
    },
  },
);
