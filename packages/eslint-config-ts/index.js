import browserTsConfig from './configs/browser-ts.js';
import nodeTsConfig from './configs/node-ts.js';
import tsPatchConfig from './configs/ts-patch.js';

export default {
  configs: {
    node: nodeTsConfig,
    browser: browserTsConfig,
  },
  configPatches: {
    ts: tsPatchConfig,
  },
};
