export default [
  {
    name: 'panates/es6-patch',
    files: ['**/*.{js,cjs,mjs,jsx}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // enforces no braces where they can be omitted
      // https://eslint.org/docs/rules/arrow-body-style
      'arrow-body-style': [
        'error',
        'as-needed',
        {
          requireReturnForObjectLiteral: false,
        },
      ],

      // Require parentheses around arrow function arguments
      // https://eslint.org/docs/latest/rules/arrow-parens
      'arrow-parens': 'off',

      // require space before/after arrow function's arrow
      // https://eslint.org/docs/rules/arrow-spacing
      'arrow-spacing': ['error', { before: true, after: true }],

      // Require super() calls in constructors
      // https://eslint.org/docs/latest/rules/constructor-super
      'constructor-super': 'error',

      // enforce the spacing around the * in generator functions
      // https://eslint.org/docs/rules/generator-star-spacing
      'generator-star-spacing': ['error', { before: false, after: true }],

      // disallow modifying variables of class declarations
      // https://eslint.org/docs/rules/no-class-assign
      'no-class-assign': 'error',

      // disallow arrow functions where they could be confused with comparisons
      // https://eslint.org/docs/rules/no-confusing-arrow
      // Overlaps with prettier rules
      'no-confusing-arrow': 'off',

      // disallow modifying variables that are declared using const
      'no-const-assign': 'error',

      // disallow duplicate class members
      // https://eslint.org/docs/rules/no-dupe-class-members
      'no-dupe-class-members': 'error',

      // disallow symbol constructor
      // https://eslint.org/docs/rules/no-new-symbol
      'no-new-symbol': 'error',

      // Disallow specified names in exports
      // https://eslint.org/docs/rules/no-restricted-exports
      'no-restricted-exports': [
        'error',
        {
          restrictedNamedExports: [
            'default', // use `export default` to provide a default export
            'then', // this will cause tons of confusion when your module is dynamically `import()`ed, and will break in most node ESM versions
          ],
        },
      ],

      // disallow specific imports
      // https://eslint.org/docs/rules/no-restricted-imports
      'no-restricted-imports': [
        'off',
        {
          paths: [],
          patterns: [],
        },
      ],

      // disallow to use this/super before super() calling in constructors.
      // https://eslint.org/docs/rules/no-this-before-super
      'no-this-before-super': 'error',

      // disallow useless computed property keys
      // https://eslint.org/docs/rules/no-useless-computed-key
      'no-useless-computed-key': 'error',

      // disallow unnecessary constructor
      // https://eslint.org/docs/rules/no-useless-constructor
      'no-useless-constructor': 'off',

      // disallow renaming import, export, and destructured assignments to the same name
      // https://eslint.org/docs/rules/no-useless-rename
      'no-useless-rename': [
        'error',
        {
          ignoreDestructuring: false,
          ignoreImport: false,
          ignoreExport: false,
        },
      ],

      // require let or const instead of var
      // https://eslint.org/docs/latest/rules/no-var#rule-details
      'no-var': 'error',

      // require method and property shorthand syntax for object literals
      // https://eslint.org/docs/rules/object-shorthand
      'object-shorthand': [
        'error',
        'always',
        {
          ignoreConstructors: false,
          avoidQuotes: true,
        },
      ],

      // suggest using arrow functions as callbacks
      // https://eslint.org/docs/latest/rules/prefer-arrow-callback
      'prefer-arrow-callback': [
        'error',
        {
          allowNamedFunctions: false,
          allowUnboundThis: true,
        },
      ],

      // suggest using of const declaration for variables that are never modified after declared
      // https://eslint.org/docs/latest/rules/prefer-const#rule-details
      'prefer-const': [
        'error',
        {
          destructuring: 'any',
          ignoreReadBeforeAssign: true,
        },
      ],

      // Prefer destructuring from arrays and objects
      // https://eslint.org/docs/rules/prefer-destructuring
      'prefer-destructuring': 'off',

      // disallow parseInt() in favor of binary, octal, and hexadecimal literals
      // https://eslint.org/docs/rules/prefer-numeric-literals
      'prefer-numeric-literals': 'off',

      // suggest using Reflect methods where applicable
      // https://eslint.org/docs/rules/prefer-reflect
      'prefer-reflect': 'off',

      // Enforce comparing typeof expressions against valid strings
      // https://eslint.org/docs/latest/rules/prefer-rest-params#rule-details
      'prefer-rest-params': 'off',

      // suggest using the spread syntax instead of .apply()
      // https://eslint.org/docs/rules/prefer-spread
      'prefer-spread': 'off',

      // suggest using template literals instead of string concatenation
      // https://eslint.org/docs/rules/prefer-template
      'prefer-template': 'off',

      // disallow generator functions that do not have yield
      // https://eslint.org/docs/rules/require-yield
      'require-yield': 'error',

      // enforce spacing between object rest-spread
      // https://eslint.org/docs/rules/rest-spread-spacing
      'rest-spread-spacing': ['error', 'never'],

      // require a Symbol description
      // https://eslint.org/docs/rules/symbol-description
      'symbol-description': 'error',

      // enforce usage of spacing in template strings
      // https://eslint.org/docs/rules/template-curly-spacing
      'template-curly-spacing': 'error',

      // enforce spacing around the * in yield* expressions
      // https://eslint.org/docs/rules/yield-star-spacing
      'yield-star-spacing': ['error', 'after'],

      // Disallow use of optional chaining in contexts where the undefined value is not allowed
      // https://eslint.org/docs/latest/rules/no-unsafe-optional-chaining
      'no-unsafe-optional-chaining': 'off',
    },
  },
];
