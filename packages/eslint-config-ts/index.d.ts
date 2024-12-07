import { Linter } from 'eslint';

declare const index: {
  configs: {
    node: Linter.Config;
    browser: Linter.Config;
  };
  configPatches: {
    ts: Linter.Config;
  };
};
export default index;
