import panatesTs from '@panates/eslint-config-ts';
import reactPatchConfig from './react-patch.js';

/** A React application or library in TypeScript, running in a browser. */
export default [
  ...panatesTs.configs.browser,
  ...reactPatchConfig,
  {
    name: 'panates/react',
  },
];
