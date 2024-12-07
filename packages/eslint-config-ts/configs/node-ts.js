import panatesEslint from '@panates/eslint-config';
import tsPatchConfig from './ts-patch.js';

export default [
  ...panatesEslint.configs.node,
  ...tsPatchConfig,
  {
    name: 'panates/node-ts',
  },
];
