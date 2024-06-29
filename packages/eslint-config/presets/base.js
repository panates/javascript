module.exports = {
  plugins: ['security'],
  extends: [
    'eslint:recommended',
    'plugin:prettier/recommended',
    ...['../rules/base', '../rules/es6', '../rules/imports'].map(require.resolve),
  ],
  rules: {},
};
