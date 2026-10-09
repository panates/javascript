import reactConfig from './configs/react.js';
import reactPatchConfig from './configs/react-patch.js';

/**
 * Next.js and Vite are not here: each needs a plugin a project on the other does not have, so they
 * are their own entry points - `@panates/eslint-config-react/next` and `.../vite`.
 */
export default {
  configs: {
    react: reactConfig,
  },
  configPatches: {
    react: reactPatchConfig,
  },
};
