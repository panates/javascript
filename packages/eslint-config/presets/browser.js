module.exports = {
  overrides: [
    {
      files: ['**/*.{js,cjs}'],
      env: {
        node: true,
      },
      extends: ['./base', '../rules/browser'].map(require.resolve),
      rules: {},
    },
    {
      files: ['**/*.mjs'],
      env: {
        node: true,
      },
      parser: '@babel/eslint-parser',
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
        },
      },
      extends: ['./base', '../rules/browser'].map(require.resolve),
    },
  ],
};
