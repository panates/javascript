import tseslint from 'typescript-eslint';

export default [
  {
    overrides: tseslint.config({
      files: ['**/*.{ts,tsx,mts,cts}'],
      extends: [tseslint.configs.recommended],
      // rules: {
      //   '@typescript-eslint/array-type': 'error',
      //   '@typescript-eslint/consistent-type-imports': 'error',
      // },
    }),
  },
];
