import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'expect';

/**
 * `rman check`'s worker, run the way `check` runs it: a process in the package's directory, the entry
 * as its argument, one JSON line back. Real dpdm over real files, because what is under test is what
 * dpdm resolves - a cycle through an import it cannot follow is the failure this exists for.
 */
describe('check-worker', () => {
  const WORKER = path.resolve(import.meta.dirname, '../node/commands/check-worker.js');
  const DPDM = path.resolve(import.meta.dirname, '../../../node_modules/dpdm');
  const dirs: string[] = [];
  after(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  /** A package with these sources, a nodenext tsconfig, and the workspace's dpdm. */
  function pkg(files: Record<string, string>, options: { tsconfig?: boolean } = {}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rman-preset-check-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pkg', type: 'module' }));
    if (options.tsconfig !== false) {
      fs.writeFileSync(
        path.join(dir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { module: 'nodenext', moduleResolution: 'nodenext' }, include: ['src'] }),
      );
    }
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.symlinkSync(DPDM, path.join(dir, 'node_modules', 'dpdm'));
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
  }

  function check(dir: string): { files: number; cycles: string[][]; unresolved: { file: string; request: string }[] } {
    const out = execFileSync(process.execPath, [WORKER, './src/index.ts'], { cwd: dir, encoding: 'utf-8' });
    return JSON.parse(out.trim().split('\n').at(-1)!);
  }

  it('finds a cycle, with paths relative to the package', () => {
    const dir = pkg({
      'src/index.ts': `import { b } from './b.js';\nexport const a = () => b;\n`,
      'src/b.ts': `import { a } from './index.js';\nexport const b = () => a;\n`,
    });
    expect(check(dir)).toMatchObject({ files: 2, cycles: [['src/index.ts', 'src/b.ts']], unresolved: [] });
  });

  it('reports an import it cannot resolve', () => {
    const dir = pkg({ 'src/index.ts': `import { x } from './nope.js';\nexport const y = x;\n` });
    expect(check(dir).unresolved).toEqual([expect.objectContaining({ file: 'src/index.ts', request: './nope.js' })]);
  });

  /**
   * **The case that made unresolved imports an error.** Without a tsconfig dpdm cannot map `./b.js` to
   * `b.ts`, so it never reaches `b.ts` and the cycle through it does not exist as far as it knows - the
   * CLI, run with `--no-warning`, answered "no circular dependency". The miss is the only trace.
   */
  it('reports the miss that hides a cycle when the package has no tsconfig', () => {
    const dir = pkg(
      {
        'src/index.ts': `import { b } from './b.js';\nexport const a = () => b;\n`,
        'src/b.ts': `import { a } from './index.js';\nexport const b = () => a;\n`,
      },
      { tsconfig: false },
    );
    const result = check(dir);
    expect(result.cycles).toEqual([]);
    expect(result.unresolved).toEqual([expect.objectContaining({ request: './b.js' })]);
  });

  /** Measured across 70 packages: `bun:sqlite` in sqb was the only unresolved import there was. */
  it('does not count a runtime module as unresolved', () => {
    const dir = pkg({ 'src/index.ts': `import { Database } from 'bun:sqlite';\nexport const d = Database;\n` });
    expect(check(dir).unresolved).toEqual([]);
  });

  it('does not count a dynamic import as unresolved', () => {
    const dir = pkg({ 'src/index.ts': `export const load = () => import('not-installed-anywhere');\n` });
    expect(check(dir).unresolved).toEqual([]);
  });

  it('answers clean for a package with neither', () => {
    const dir = pkg({
      'src/index.ts': `import { b } from './b.js';\nexport const a = b;\n`,
      'src/b.ts': `export const b = 1;\n`,
    });
    expect(check(dir)).toEqual({ files: 2, cycles: [], unresolved: [] });
  });
});
