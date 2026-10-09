import nextPlugin from '@next/eslint-plugin-next';
import reactConfig from './react.js';

/**
 * A Next.js application: the React config plus Next's own rules, at the stricter
 * `core-web-vitals` level `create-next-app` sets up (it includes `recommended`).
 *
 * Its own entry point (`@panates/eslint-config-react/next`), so a project that is not on Next does
 * not need `@next/eslint-plugin-next` installed.
 */
export default [
  ...reactConfig,
  {
    ...nextPlugin.configs['core-web-vitals'],
    name: 'panates/next',
  },
];
