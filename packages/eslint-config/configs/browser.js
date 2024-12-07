import globals from 'globals';
import baseConfig from './base.js';
import browserPatchConfig from './browser-patch.js';
import es6PatchConfig from './es6-patch.js';
import importsPatchConfig from './imports-patch.js';

export default [
  ...baseConfig,
  ...es6PatchConfig,
  ...importsPatchConfig,
  ...browserPatchConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
