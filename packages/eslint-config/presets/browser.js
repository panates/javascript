module.exports = {
  env: {
    browser: true,
  },
  extends: ['./base', '../rules/browser'].map(require.resolve),
  rules: {},
  overrides: [
    {
      files: ['**/*.mjs'],
      parser: '@babel/eslint-parser',
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
        },
      },
    },
  ],
};
