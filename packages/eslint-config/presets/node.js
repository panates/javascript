module.exports = {
  env: {
    node: true,
  },
  extends: ['./base', '../rules/node'].map(require.resolve),
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
