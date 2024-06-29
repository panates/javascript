module.exports = {
  extends: ['./packages/eslint-config/presets/node'].map(require.resolve),
  rules: {
    'import-x/extensions': 'off',
  },
};
