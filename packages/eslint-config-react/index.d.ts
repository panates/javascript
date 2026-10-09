import { Linter } from 'eslint';

declare const index: {
  configs: {
    react: Linter.Config[];
  };
  configPatches: {
    react: Linter.Config[];
  };
};
export default index;
