import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import reactConfig from './react.js';

/**
 * A React application built with Vite: the React config plus `react-refresh/only-export-components`,
 * which flags a module whose exports would make Vite's hot reload fall back to a full page reload.
 *
 * What a build or a test run writes - `dist`, `coverage` - is not linted.
 *
 * Its own entry point (`@panates/eslint-config-react/vite`), so a project that is not on Vite does
 * not need `eslint-plugin-react-refresh` installed.
 */
export default [
  {
    name: 'panates/vite/ignores',
    ignores: ['**/dist/**', '**/coverage/**'],
  },
  ...reactConfig,
  {
    ...reactRefreshPlugin.configs.vite,
    name: 'panates/vite',
    files: ['**/*.{tsx,jsx}'],
  },
];
