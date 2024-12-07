import { Linter } from 'eslint';

declare const index: {
  configs: {
    base: Linter.Config;
    node: Linter.Config;
    browser: Linter.Config;
  };
  configPatches: {
    browser: Linter.Config;
    es6: Linter.Config;
    imports: Linter.Config;
    node: Linter.Config;
  };
};
export default index;
