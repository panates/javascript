import browserTsConfig from './configs/browser-ts.js';
import memberOrderingConfig from './configs/member-ordering.js';
import nodeTsConfig from './configs/node-ts.js';
import tsPatchConfig from './configs/ts-patch.js';

export default {
  configs: {
    node: nodeTsConfig,
    browser: browserTsConfig,
  },
  configPatches: {
    ts: tsPatchConfig,
    /**
     * Opt-in: `@typescript-eslint/member-ordering` has no autofix, so enabling it turns an
     * existing tree red with nothing to clear it mechanically. See configs/member-ordering.js.
     */
    memberOrdering: memberOrderingConfig,
  },
};
