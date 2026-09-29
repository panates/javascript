import { Linter } from 'eslint';

declare const index: {
  configs: {
    node: Linter.Config;
    browser: Linter.Config;
  };
  configPatches: {
    ts: Linter.Config;
    /** Opt-in - the rule has no autofix. See configs/member-ordering.js. */
    memberOrdering: Linter.Config;
  };
};
export default index;
