// eslint-disable-next-line import-x/no-extraneous-dependencies
import panatesEslint from '@panates/eslint-config';

export default [
  ...panatesEslint.configs.node,
  {
    rules: {
      'import-x/extensions': 'off',
    },
  },
];
