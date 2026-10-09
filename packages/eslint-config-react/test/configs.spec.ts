import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Linter } from 'eslint';
import { ESLint } from 'eslint';
import { expect } from 'expect';
import panatesReact from '../index.js';
import nextConfig from '../configs/next.js';
import viteConfig from '../configs/vite.js';

/**
 * Each config run by a real ESLint over a file, asserting on the rule ids that fire.
 *
 * What a config package exports is not behaviour but a claim about what ESLint will do with it -
 * a plugin config spread into the wrong shape, a `files` glob that matches nothing, two plugins
 * reporting one mistake twice. None of that shows until ESLint has merged it and linted something.
 */
describe('@panates/eslint-config-react', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panates-eslint-react-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  async function ruleIds(config: Linter.Config[], file: string, code: string): Promise<string[]> {
    const eslint = new ESLint({ cwd: dir, overrideConfigFile: true, overrideConfig: config });
    const [result] = await eslint.lintText(code, { filePath: path.join(dir, file) });
    /** Formatting is the base config's subject, and a temporary directory has no `.prettierrc`, so
     *  prettier would hold these samples to its defaults rather than this repository's style. */
    return result!.messages.map((m) => m.ruleId ?? `fatal: ${m.message}`).filter((id) => id !== 'prettier/prettier');
  }

  async function ignored(config: Linter.Config[], file: string): Promise<boolean> {
    return new ESLint({ cwd: dir, overrideConfigFile: true, overrideConfig: config }).isPathIgnored(
      path.join(dir, file),
    );
  }

  const clean = `import { useState } from 'react';

export function Counter({ start }: { start: number }) {
  const [count, setCount] = useState(start);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`;

  describe('react', () => {
    const react = panatesReact.configs.react;

    it('parses TSX and passes a clean component', async () => {
      expect(await ruleIds(react, 'src/Counter.tsx', clean)).toEqual([]);
    });

    it("reports a hook called conditionally - once, from React's own plugin", async () => {
      const ids = await ruleIds(
        react,
        'src/Bad.tsx',
        `import { useState } from 'react';

export function Bad({ on }: { on: boolean }) {
  if (on) {
    const [v] = useState(0);
    return <i>{v}</i>;
  }
  return null;
}
`,
      );
      expect(ids.filter((id) => /rules-of-hooks/.test(id ?? ''))).toEqual(['react-hooks/rules-of-hooks']);
    });

    it('reports an effect dependency left out - once, though both plugins have the rule', async () => {
      const ids = await ruleIds(
        react,
        'src/Effect.tsx',
        `import { useEffect } from 'react';

export function Effect({ id }: { id: string }) {
  useEffect(() => {
    document.title = id;
  }, []);
  return null;
}
`,
      );
      expect(ids.filter((id) => /exhaustive-deps/.test(id))).toEqual(['react-hooks/exhaustive-deps']);
    });

    /** A bundler resolves `./Button` - the base config's `.js` rule is Node's and is off here. */
    it('takes a relative import without an extension', async () => {
      const ids = await ruleIds(
        react,
        'src/Page.tsx',
        `import { Button } from './Button';

export function Page() {
  return <Button />;
}
`,
      );
      expect(ids).not.toContain('import-x/extensions');
    });

    it('reports a list rendered without keys', async () => {
      const ids = await ruleIds(
        react,
        'src/List.tsx',
        `export function List({ items }: { items: string[] }) {
  return <ul>{items.map(i => <li>{i}</li>)}</ul>;
}
`,
      );
      expect(ids).toContain('@eslint-react/no-missing-key');
    });

    it('applies to a hook in a plain .ts file too', async () => {
      const ids = await ruleIds(
        react,
        'src/use-thing.ts',
        `import { useState } from 'react';

export function useThing(on: boolean) {
  if (on) return useState(0);
  return undefined;
}
`,
      );
      expect(ids).toContain('react-hooks/rules-of-hooks');
    });
  });

  describe('next', () => {
    it("adds Next's rules", async () => {
      const ids = await ruleIds(
        nextConfig,
        'app/page.tsx',
        `export default function Page() {
  return <img src="/logo.png" alt="logo" />;
}
`,
      );
      expect(ids).toContain('@next/next/no-img-element');
    });

    it('keeps the React rules underneath', async () => {
      expect(await ruleIds(nextConfig, 'app/Counter.tsx', clean)).toEqual([]);
    });

    it("leaves Next's build output alone", async () => {
      expect(await ignored(nextConfig, '.next/server/app/page.js')).toBe(true);
      expect(await ignored(nextConfig, 'app/page.tsx')).toBe(false);
    });
  });

  describe('vite', () => {
    it('reports a component module that also exports something else', async () => {
      const ids = await ruleIds(
        viteConfig,
        'src/App.tsx',
        `export const VERSION = Math.random();

export function App() {
  return <div />;
}
`,
      );
      expect(ids).toContain('react-refresh/only-export-components');
    });

    it('keeps the React rules underneath', async () => {
      expect(await ruleIds(viteConfig, 'src/Counter.tsx', clean)).toEqual([]);
    });

    /** A build leaves compiled code in `dist`, which would otherwise be linted as source. */
    it('leaves the build and coverage output alone', async () => {
      expect(await ignored(viteConfig, 'dist/assets/index.js')).toBe(true);
      expect(await ignored(viteConfig, 'packages/web/dist/index.js')).toBe(true);
      expect(await ignored(viteConfig, 'coverage/lcov-report/index.js')).toBe(true);
      expect(await ignored(viteConfig, 'src/App.tsx')).toBe(false);
    });
  });
});
