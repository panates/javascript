module.exports = {
  env: {
    browser: true,
  },
  extends: ['./base', '../rules/base', '../rules/browser'].map(require.resolve),
};
