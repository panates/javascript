module.exports = {
  extends: ['plugin:import-x/recommended'],
  plugins: ['simple-import-sort'],
  rules: {
    // Verifies that all named imports are part of the set of named exports in the referenced module.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/named.md
    // !! Does not work as expected for TypeScript generated packages
    'import-x/named': 'off',

    // Reports funny business with exports, like repeated exports of names or defaults.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/export.md
    'import-x/export': 'error',

    // Reports the use of empty named import blocks.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-empty-named-blocks.md
    'import-x/no-empty-named-blocks': 'error',

    // Forbid the import of external modules that are not declared in the package.json
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-extraneous-dependencies.md
    'import-x/no-extraneous-dependencies': 'error',

    // Forbids the use of mutable exports with var or let.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-mutable-exports.md
    'import-x/no-mutable-exports': 'error',

    // Reports use of an exported name as the locally imported name of a default export.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-named-as-default.md
    'import-x/no-named-as-default': 'error',

    // Reports use of an exported name as a property on the default export.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-named-as-default-member.md
    'import-x/no-named-as-default-member': 'error',

    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-unused-modules.md
    'import-x/no-unused-modules': 'error',

    // This rule forbids the import of modules using absolute paths.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-absolute-path.md
    'import-x/no-absolute-path': 'error',

    // Ensures that there is no resolvable path back to this module via its dependencies.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-cycle.md
    'import-x/no-cycle': 'error',

    // Forbid a module from importing itself. This can sometimes happen during refactoring.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-self-import.md
    'import-x/no-self-import': 'error',

    // Ensures an imported module can be resolved to a module on the local filesystem, as defined by standard Node require.resolve behavior.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-unresolved.md
    'import-x/no-unresolved': ['error', { commonjs: true, amd: true }],

    // Use this rule to prevent unnecessary path segments in import and require statements.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-cycle.md
    'import-x/no-useless-path-segments': 'error',

    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/extensions.md
    'import-x/extensions': ['error', 'ignorePackages'],

    // This rule reports any imports that come after non-import statements.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/first.md
    'import-x/first': 'error',

    // Reports if a resolved path is imported more than once.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/no-duplicates.md
    'import-x/no-duplicates': 'error',

    // Enforces having one or more empty lines after the last top-level import statement or require call.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/newline-after-import.md
    'import-x/newline-after-import': 'error',

    // Enforce a convention in the order of require() / import statements.
    // https://github.com/antfu/eslint-plugin-import-x/blob/master/docs/rules/order.md
    // We use simple-import-sort/imports for this rule
    'import-x/order': 'off',

    'simple-import-sort/imports': [
      'error',
      {
        groups: [
          [
            // Side effect imports.
            '^\\u0000',
            // Node.js builtins prefixed with `node:`.
            '^node:',
            // Packages.
            // Things that start with a letter (or digit or underscore), or `@` followed by a letter.
            '^@?\\w',
            // Absolute imports and other imports such as Vue-style `@/foo`.
            // Anything not matched in another group.
            '^',
            // Relative imports.
            // Parent directory imports
            '^\\.\\.',
            // Current directory
            '^\\.',
          ],
        ],
      },
    ],

    'simple-import-sort/exports': 'error',
  },
};
