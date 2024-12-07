import globals from 'globals';
import baseConfig from './base.js';
import es6PatchConfig from './es6-patch.js';
import importsPatchConfig from './imports-patch.js';
import nodePatchConfig from './node-patch.js';

export default [
  ...baseConfig,
  ...es6PatchConfig,
  ...importsPatchConfig,
  ...nodePatchConfig,
  {
    name: 'panates/node',
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
