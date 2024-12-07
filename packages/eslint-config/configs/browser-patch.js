export default [
  {
    name: 'panates/browser-patch',
    rules: {
      // disallow the use of alert, confirm, and prompt
      // https://eslint.org/docs/rules/no-alert
      'no-alert': 'warn',
    },
  },
];
