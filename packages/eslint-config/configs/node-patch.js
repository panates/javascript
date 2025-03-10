export default [
  {
    name: 'panates/node-patch',
    rules: {
      // disallow use of the Buffer() constructor
      // https://eslint.org/docs/rules/no-buffer-constructor
      'no-buffer-constructor': 'error',

      // disallow mixing regular variable and require declarations
      // https://eslint.org/docs/latest/rules/no-mixed-requires
      'no-mixed-requires': ['off', false],

      // disallow use of new operator with the require function
      // https://eslint.org/docs/latest/rules/no-new-require
      'no-new-require': 'error',

      // disallow string concatenation with __dirname and __filename
      // https://eslint.org/docs/rules/no-path-concat
      'no-path-concat': 'off',

      // disallow use of process.env
      // https://eslint.org/docs/rules/no-process-env
      'no-process-env': 'off',

      // disallow process.exit()
      // https://eslint.org/docs/rules/no-process-exit
      'no-process-exit': 'off',

      // restrict usage of specified node modules
      // https://eslint.org/docs/rules/no-restricted-modules
      'no-restricted-modules': 'off',

      // disallow use of synchronous methods (off by default)
      // https://eslint.org/docs/rules/no-syn
      'no-sync': 'off',

      // enforces error handling in callbacks (node environment)
      // https://eslint.org/docs/latest/rules/handle-callback-err
      'handle-callback-err': 'off',
    },
  },
];
