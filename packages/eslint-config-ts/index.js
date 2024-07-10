module.exports = {
  overrides: [
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      plugins: ['@typescript-eslint'],
      extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        ...['./rules/typescript'].map(require.resolve),
      ],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: true,
      },
    },
  ],
};
