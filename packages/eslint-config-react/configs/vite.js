import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import reactConfig from './react.js';

/**
 * A React application built with Vite: the React config plus `react-refresh/only-export-components`,
 * which flags a module whose exports would make Vite's hot reload fall back to a full page reload.
 *
 * Its own entry point (`@panates/eslint-config-react/vite`), so a project that is not on Vite does
 * not need `eslint-plugin-react-refresh` installed.
 */
export default [
  ...reactConfig,
  {
    ...reactRefreshPlugin.configs.vite,
    name: 'panates/vite',
    files: ['**/*.{tsx,jsx}'],
  },
];
