# @panates/eslint-config-react

React rules for Panates' ESLint config, on top of
[`@panates/eslint-config-ts`](https://github.com/panates/javascript/tree/main/packages/eslint-config-ts).
For TypeScript React projects, ESLint 10 and flat config.

| Config | For | Brings |
| --- | --- | --- |
| `configs.react` | any React project in a browser | [`@eslint-react`](https://eslint-react.xyz) for components and JSX, React's own [`react-hooks`](https://react.dev/reference/eslint-plugin-react-hooks) for hooks and the React Compiler |
| `@panates/eslint-config-react/next` | Next.js | the above, plus [`@next/eslint-plugin-next`](https://nextjs.org/docs/app/api-reference/config/eslint) at `core-web-vitals` |
| `@panates/eslint-config-react/vite` | Vite | the above, plus [`react-refresh`](https://github.com/ArnaudBarre/eslint-plugin-react-refresh) for hot reload |

## Install

```bash
npm i -D eslint @panates/eslint-config-react @eslint-react/eslint-plugin eslint-plugin-react-hooks
# Next.js
npm i -D @next/eslint-plugin-next
# Vite
npm i -D eslint-plugin-react-refresh
```

## Use

```js
// eslint.config.mjs
import panatesReact from '@panates/eslint-config-react';

export default [...panatesReact.configs.react];
```

```js
// eslint.config.mjs - Next.js
import next from '@panates/eslint-config-react/next';

export default [...next];
```

```js
// eslint.config.mjs - Vite
import vite from '@panates/eslint-config-react/vite';

export default [...vite];
```

The Vite entry leaves `dist` and `coverage` unlinted, the Next one `.next`. A build directory of
your own goes in an `ignores` block of your own.

`configPatches.react` is the React layer alone, to add on top of a config of your own.

## Notes

- **`@eslint-react`, not `eslint-plugin-react`**: the latter, and `eslint-plugin-jsx-a11y`, support
  ESLint 9 at most. Accessibility rules will come as a patch once a plugin supports ESLint 10.
- **Hooks are checked once.** Rules both plugins have (`rules-of-hooks`, `exhaustive-deps`, the
  React Compiler ones) are left to `react-hooks`.
- **Relative imports need no extension** (`import-x/extensions` is off) - a bundler resolves them.
- **A prettier plugin named in a package's prettier config is resolved from where ESLint runs.**
  Formatting is checked through `eslint-plugin-prettier`, and prettier looks a plugin name such as
  `'prettier-plugin-tailwindcss'` up from the working directory - so `eslint` run at a monorepo's
  root fails with `Cannot find package ...` for a plugin only that package installs. Resolve it
  against the config file instead:

  ```js
  // prettier.config.js
  import { fileURLToPath } from 'node:url';

  export default {
    plugins: [fileURLToPath(import.meta.resolve('prettier-plugin-tailwindcss'))],
  };
  ```
