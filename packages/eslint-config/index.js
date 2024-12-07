import baseConfig from './configs/base.js';
import browserConfig from './configs/browser.js';
import browserPatchConfig from './configs/browser-patch.js';
import es6PatchConfig from './configs/es6-patch.js';
import importsPatchConfig from './configs/imports-patch.js';
import nodeConfig from './configs/node.js';
import nodePatchConfig from './configs/node-patch.js';

export default {
  configs: {
    base: baseConfig,
    node: nodeConfig,
    browser: browserConfig,
  },
  configPatches: {
    browser: browserPatchConfig,
    es6: es6PatchConfig,
    imports: importsPatchConfig,
    node: nodePatchConfig,
  },
};
