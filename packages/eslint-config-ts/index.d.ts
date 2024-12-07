import { Linter } from 'eslint';

declare const index: {
  configs: {
    tsNode: Linter.Config;
    tsBrowser: Linter.Config;
  };
  configPatches: {
    ts: Linter.Config;
  };
};
export default index;
