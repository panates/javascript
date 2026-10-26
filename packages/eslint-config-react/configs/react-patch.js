import eslintReact from '@eslint-react/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

/** Every file a component or a hook can live in - a hook in a plain `.ts` included. */
const FILES = ['**/*.{ts,tsx,mts,cts,jsx}'];

const eslintReactRecommended = eslintReact.configs['recommended-typescript'];
const reactHooksRecommended = reactHooks.configs.flat.recommended;

/**
 * The rules both plugins ship under the same name - `rules-of-hooks`, `exhaustive-deps` and the
 * React Compiler ones - turned off on the `@eslint-react` side. Derived from the two configs rather
 * than listed, because the overlap moves as either plugin adds rules: a list written by hand missed
 * `exhaustive-deps`, which reported every missing dependency twice.
 */
const duplicatesOff = Object.fromEntries(
  Object.keys(eslintReactRecommended.rules)
    .filter((rule) => `react-hooks/${rule.replace('@eslint-react/', '')}` in reactHooksRecommended.rules)
    .map((rule) => [rule, 'off']),
);

/**
 * React on top of a TypeScript config: `@eslint-react`'s rules for components and JSX, and React's
 * own `react-hooks` for hooks and the React Compiler.
 *
 * `@eslint-react` rather than `eslint-plugin-react`, because the base config needs ESLint 10 and
 * `eslint-plugin-react` (7.37) and `eslint-plugin-jsx-a11y` (6.10) declare support up to 9 only.
 * Its `recommended-typescript` set needs no type information, so it works without a `projectService`.
 *
 * Hooks come from `react-hooks`, not `@eslint-react`: it is React's own plugin, it carries the React
 * Compiler rules. The rules both plugins have are turned off on the `@eslint-react` side
 * (`duplicatesOff`), so one mistake is reported once.
 *
 * `import-x/extensions` is off: the base config asks for `.js` on a relative import, which is Node's
 * ESM rule, while a React project is built by a bundler (Next, Vite) and imports without one.
 * Measured on `abisena-tr`: 272 reports, every one an ordinary `./component` import.
 *
 * `@eslint-react/no-array-index-key` is off: an index is the right key for a list whose items are
 * their position - one input box per OTP digit, the parts of a formatted date, a consumer's array of
 * actions with no identity of its own - and the rule cannot tell such a list from one that reorders.
 * Measured on `panates/peacox-ui`: 12 reports, each a positional list or a list with no other key.
 * Keying a list that does reorder by something stable stays the author's call.
 */
export default [
  {
    ...eslintReactRecommended,
    name: 'panates/react-patch/eslint-react',
    files: FILES,
  },
  {
    ...reactHooksRecommended,
    name: 'panates/react-patch/react-hooks',
    files: FILES,
  },
  {
    name: 'panates/react-patch',
    files: FILES,
    rules: {
      ...duplicatesOff,
      'import-x/extensions': 'off',
      '@eslint-react/no-array-index-key': 'off',
    },
  },
];
