import nextPlugin from '@next/eslint-plugin-next';
import reactConfig from './react.js';

/**
 * Next's `core-web-vitals` config in flat form, from either plugin line the peer range takes in.
 *
 * 16 ships `configs` flat and has no `flatConfig`; 15 ships `configs` in the eslintrc shape -
 * `plugins` an array of names, which flat config rejects outright - and the flat ones under
 * `flatConfig`. Measured on 16.4.2 and 15.5.28. Reading `configs` alone made this entry work on 16
 * only, while its peer range said `>=15`.
 *
 * @param {typeof nextPlugin} plugin
 */
export function coreWebVitals(plugin) {
  return plugin.flatConfig?.coreWebVitals ?? plugin.configs['core-web-vitals'];
}

/**
 * A Next.js application: the React config plus Next's own rules, at the stricter
 * `core-web-vitals` level `create-next-app` sets up (it includes `recommended`).
 *
 * Next's build output, `.next`, is not linted.
 *
 * Its own entry point (`@panates/eslint-config-react/next`), so a project that is not on Next does
 * not need `@next/eslint-plugin-next` installed.
 */
export default [
  {
    name: 'panates/next/ignores',
    ignores: ['**/.next/**'],
  },
  ...reactConfig,
  {
    ...coreWebVitals(nextPlugin),
    name: 'panates/next',
  },
];
