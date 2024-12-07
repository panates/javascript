import panatesEslint from '@panates/eslint-config';
import tsPatchConfig from './ts-patch.js';

export default [
  ...panatesEslint.configs.browser,
  ...tsPatchConfig,
  {
    name: 'panates/browser-ts',
  },
];
