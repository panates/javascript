module.exports = {
  env: {
    node: true,
  },
  extends: ['./base', '../rules/node'].map(require.resolve),
  rules: {},
};
