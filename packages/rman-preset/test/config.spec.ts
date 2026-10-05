import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect } from 'expect';
import type { CommandEntry, RmanConfig, RunStepContext, RunStepFn, RunStepObject } from 'rman';
import { Repository, runOptions } from 'rman';
import { cleanupFixtures, fixtureDir, repositoryFor } from './_fixture.js';

/**
 * One package's `run.<script>` block, narrowed.
 *
 * `RunConfig` is keyed by script name and its value is a union: a bare string is shorthand for
 * `{ exec }`, so `config.run.build.exec` does not type-check without saying which form this is.
 * The cast is the spec's own assertion that the config declares the object form - if it ever
 * shipped the shorthand instead, the expectations below would be reading `undefined`.
 */
function buildScript(repo: Repository, name = 'pkg-a'): RmanConfig.RunScriptOptions {
  return repo.getPackage(name)?.config.run?.build as RmanConfig.RunScriptOptions;
}

/**
 * The steps a slot holds, with the object form unwrapped.
 *
 * A slot is a shell command, a function, a `{ topo, command }` object, or a list of any of those -
 * the same reduction rman's own `toStep` makes before running one. **The spelling is the subject of
 * exactly one case here** (the `topo` one below); every other case is about what a step *does*, and
 * reading `.command` at each of them would be eight copies of a fact that belongs in one place.
 *
 * It was eight direct casts, and the config moving to the object form turned all eight into
 * `after is not a function` - a failure about the shape, in cases about copying files.
 */
function stepsOf(value: unknown): (string | RunStepFn)[] {
  const items = Array.isArray(value) ? value : [value];
  return items
    .filter((item) => item !== undefined && item !== null && item !== '')
    .map((item) =>
      typeof item === 'object' ? ((item as RunStepObject).command as string | RunStepFn) : (item as string | RunStepFn),
    );
}

/**
 * The one function step a slot holds, refusing anything else.
 *
 * A slot that turned out to hold a *string* would otherwise be called as a function, and the
 * TypeError would name the test's own line rather than the config's mistake.
 */
function stepFn(value: unknown): RunStepFn {
  const steps = stepsOf(value);
  if (steps.length !== 1 || typeof steps[0] !== 'function') {
    throw new Error(`expected one function step, got ${steps.length} (${steps.map((s) => typeof s).join(', ')})`);
  }
  return steps[0];
}

/** The build's `after` hook, typed for the partial context these cases hand it - it reads `pkg` and
 *  `repository` and nothing else. */
function afterHook(repo: Repository, name = 'pkg-a'): (ctx: { pkg: unknown; repository: unknown }) => void {
  return stepFn(buildScript(repo, name).after) as unknown as (ctx: { pkg: unknown; repository: unknown }) => void;
}

/**
 * The `commands` entries this config contributed, off the **root** package's resolved config.
 *
 * Read from one package rather than summed across all of them because the key cascades: an
 * unmarked declaration reaches the root and every package below it, so the same three factories
 * arrive once per package. rman de-duplicates them by identity when it builds the command list;
 * a spec adding them up would be counting the packages.
 */
function commandEntries(repo: Repository): CommandEntry[] {
  const value = repo.rootPackage.config.commands;
  return Array.isArray(value) ? value : value ? [value] : [];
}

/**
 * The names those entries answer to.
 *
 * A declarative entry is a factory of the application, so its metadata - the `command` string the
 * name comes from - does not exist until it is called. That is exactly what `cli.ts` does with it,
 * with `app.repository` in place, which is why the repository has to be built first.
 *
 * A glob entry is dropped rather than resolved: it names files whose own modules hold the answer,
 * which is rman's job to import and not a spec's to re-implement. This config declares none - see
 * the last case in the `commands` suite, which is what pins that.
 */
/** One declared command's metadata, by name - the factory called the way `cli.ts` calls it. */
function declaredCommand(repo: Repository, name: string): any {
  const found = commandEntries(repo)
    .filter((entry): entry is Exclude<CommandEntry, string> => typeof entry !== 'string')
    .map((entry) => (typeof entry === 'function' ? entry(repo.app) : entry))
    .find((meta) => meta.command!.split(/\s+/)[0] === name);
  if (!found) throw new Error(`No declared command named "${name}"`);
  return found;
}

function declaredCommandNames(repo: Repository): string[] {
  return commandEntries(repo)
    .filter((entry): entry is Exclude<CommandEntry, string> => typeof entry !== 'string')
    .map((entry) => (typeof entry === 'function' ? entry(repo.app) : entry).command!.split(/\s+/)[0]);
}

/**
 * The real CLI, in a fixture repository, as a child process.
 *
 * **A subprocess rather than `runCli`, and `--help` is the reason.** yargs answers `--help` by
 * calling `process.exit`, which from inside mocha kills the test process - measured in rman's own
 * suite, where a spec doing this ended a run at 109 tests with exit 0 and nothing to show for it.
 * Spawning also proves the more useful thing: that these commands reach yargs at all.
 *
 * `node_modules/rman/cli.js` rather than `node_modules/.bin/rman`, because the fixture links the
 * package directory itself and never runs npm, so there is no `.bin` shim to find.
 */
async function runRman(cwd: string, ...args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cli = path.join(cwd, 'node_modules', 'rman', 'cli.js');
  return promisify(execFile)(process.execPath, [cli, ...args], { cwd });
}

/** A repository's own command, for the one spec about the `.rman/` default surviving this config.
 *  The `defineCommand` object form, which is what a `.rman/*.mjs` is, written inline so the
 *  fixture needs nothing but a string. */
const HELLO_COMMAND = `export default {
  command: 'hello',
  describe: "This repository's own command",
  handler: () => {},
};
`;

/**
 * What a repository actually gets by writing `extends: '@panates/rman-preset'`.
 *
 * Every case here goes through a real `Repository.create`, because that is the only thing that
 * merges the selector blocks, cascades them per package and evaluates the expressions - and every
 * bug this file was written after was invisible until it had.
 */
describe('@panates/rman-preset: the config a repository inherits', () => {
  after(cleanupFixtures);

  describe('loading', () => {
    /**
     * The one that has to pass before any other assertion means anything. A shared config that
     * throws while *resolving* takes every rman command in the repository with it - `list` and
     * `info` included - because config resolution is what every command does first.
     */
    it('resolves at all, in a repository that inherits nothing of its own', async () => {
      await expect(repositoryFor()).resolves.toBeDefined();
    });

    /**
     * **Asserted through the manifest reader rather than through command names**, and the rename
     * that forced the change is the reason: `publish` used to be one of `rman-node`'s commands and
     * is rman's own as of 2.0, so a spec listing `['clean', 'publish', 'ci']` was pinning where a
     * command happens to live rather than whether the plugin loaded at all.
     *
     * `provider` is the stabler question and the more direct one: only a technology can read a
     * `package.json`, so `'node'` here means the Node platform is in play. In rman 2 that no longer
     * comes from anything this package declares - rman lays its own presets under every repository
     * root - so what this case really pins is that nothing in the preset displaces it. Without a
     * technology a package falls back to its directory name at `0.0.0`.
     */
    it('brings the Node plugin, so packages are read as npm packages', async () => {
      const repo = await repositoryFor();
      expect(repo.getPackage('pkg-a')?.provider).toBe('node');
      expect(repo.getPackage('pkg-a')?.version).toBe('1.0.0');
    });

    /**
     * The `npm` publish target arrives the same way, through the inherited config's
     * `publishTargets` - so `rman publish` has somewhere to publish to. Asserted separately from
     * the manifest reader because they are two different keys of that config: measured while
     * converting this package, a plugin can load and register its technology while contributing no
     * target at all.
     */
    it('brings the npm publish target', async () => {
      const repo = await repositoryFor();
      expect([...repo.app.publishTargets].map((t) => t.name)).toContain('npm');
    });
  });

  describe('clean', () => {
    it('cleans a package: its build output, its tsbuildinfo, its own coverage directory', async () => {
      const repo = await repositoryFor();
      const include = repo.getPackage('pkg-a')?.config.clean?.include as string[];
      expect(include).toEqual(expect.arrayContaining(['build', '*.tsbuildinfo']));
      expect(include.some((entry) => entry.endsWith(`coverage/pkg-a`))).toBe(true);
    });

    /**
     * **Nothing may appear twice.** `clean` deleting the same glob twice is harmless, which is
     * exactly why it goes unnoticed - and a duplicate is the visible symptom of the same block
     * being declared in two selectors that both reach this package.
     */
    it('lists nothing twice', async () => {
      const repo = await repositoryFor();
      const include = repo.getPackage('pkg-a')?.config.clean?.include as string[];
      expect(include).toEqual([...new Set(include)]);
    });

    /**
     * The root has no build output of its own - it is not a TypeScript project, and `"[ws:*]"`
     * exists precisely so a per-package statement does not reach it. It *does* own the aggregate
     * coverage directory, which is the one thing it should clean.
     */
    it('cleans only the aggregate coverage directory at the root', async () => {
      const repo = await repositoryFor();
      const include = repo.config.clean?.include as string[];
      expect(include).not.toContain('build');
      expect(include).not.toContain('*.tsbuildinfo');
      expect(include.some((entry) => entry.endsWith('coverage'))).toBe(true);
    });
  });

  describe('publish and version', () => {
    it('publishes a package from its build directory', async () => {
      const repo = await repositoryFor();
      expect(repo.getPackage('pkg-a')?.config.publish?.npm?.directory).toBe('build');
    });

    /**
     * The root is private and has no build directory, so a publish directory on it describes
     * something that does not exist.
     */
    it('says nothing about publishing at the root', async () => {
      const repo = await repositoryFor();
      expect(repo.config.publish?.npm?.directory).toBeUndefined();
    });

    /**
     * **The key rman 2.0 retired, pinned so this config cannot drift back to it.**
     *
     * `publish.directory` is not ignored by rman any more - it is an error naming the new spelling,
     * because ignoring it would fall back to the package's own directory and push the source tree
     * to npm. A config package writing the old key would break every repository inheriting it.
     */
    it('never writes the retired publish.directory anywhere', async () => {
      const repo = await repositoryFor();
      for (const pkg of [repo.rootPackage, repo.getPackage('pkg-a')!]) {
        expect((pkg.config.publish as Record<string, unknown> | undefined)?.directory).toBeUndefined();
      }
    });

    /**
     * **`version.changelog` has to be on the *root's* config, and that is the whole assertion.**
     * `version.command.ts` reads `repository.config?.version?.changelog` - once per run, off the
     * root - so a declaration under `"[*]"` would work in a single-package repository, where a glob
     * reaches the root since rman 2.1.0, and silently do nothing in a monorepo. This fixture is a
     * monorepo, which is what makes the case able to fail.
     *
     * `repo.config` rather than `repo.rootPackage.config`: `repository.config` is what the command
     * actually reads, and in a monorepo the two are the same object - asserting the one the code
     * uses is the point.
     */
    it('asks version to write the changelog, declared where the command reads it', async () => {
      const repo = await repositoryFor();
      expect(repo.config.version?.changelog).toBe(true);
    });

    it("stamps the version into each package's own source constant", async () => {
      const repo = await repositoryFor();
      /** **`optional`, because this line is written on every consumer's behalf.** A file that exists
       *  and holds nothing rewritable is otherwise an error - right when a repository names the path
       *  itself, wrong for a preset that cannot know which of its consumers keeps a constant there.
       *  Measured on `panates/postgrejs`, where it refused a release over a line nobody in that
       *  repository wrote. */
      expect(repo.getPackage('pkg-a')?.config.version?.stamp).toEqual([{ file: 'src/constants.ts', optional: true }]);
      /** `group` is read from each package's config, and in a monorepo the root is not one of them.
       *  `false` means a version line per package - this config stopped releasing everything on one
       *  shared number, and the assertion said `true` for a while after it did. */
      expect(repo.getPackage('pkg-a')?.config.group).toBe(false);
    });
  });

  describe('the build script', () => {
    it('compiles with tsconfig-build.json when a package has one', async () => {
      const repo = await repositoryFor({ files: { 'packages/pkg-a/tsconfig-build.json': '{}' } });
      expect(await tscArgv(repo)).toEqual(['tsc', '-b', expect.stringMatching(/tsconfig-build\.json$/)]);
    });

    it('falls back to tsconfig.json', async () => {
      const repo = await repositoryFor();
      expect(await tscArgv(repo)).toEqual(['tsc', '-b', expect.stringMatching(/\/tsconfig\.json$/)]);
    });

    /**
     * **The failure is loud, and it happens when `build` runs - not when the config is read.**
     *
     * This assertion used to be `await expect(repositoryFor({ noTsconfig: true })).rejects`, and
     * that passing was the bug: the resolution lived in a `${{ file.resolveFirst(...) }}`
     * expression, which is evaluated while the config resolves - which *every* rman command does
     * first. So a single package without a tsconfig took down the whole repository. Measured on a
     * monorepo holding a plain-JS package beside a TypeScript one: `rman list`, `rman info`,
     * `rman config` and `rman clean --dry-run` all exited 1, each reporting a missing
     * `tsconfig.json` in a package it had not been asked about.
     *
     * Both halves are the pin, and the first is the one that regressed: the repository **resolves**,
     * and only the step throws. A function step is what buys that - it runs when its turn comes,
     * for one package.
     */
    it('resolves the repository even when a package has no tsconfig, and fails only on build', async () => {
      const repo = await repositoryFor({ noTsconfig: true });
      await expect(tscArgv(repo)).rejects.toThrow(/has none of tsconfig-build\.json/);
    });

    /** Nothing was spawned in any of the above - `runBin` is recorded, so the argv `tsc` *would*
     *  have been given is what the specs read. A real `tsc -b` would need a compiler in the
     *  fixture and would test TypeScript rather than this config. */
    async function tscArgv(repo: Repository, name = 'pkg-a'): Promise<string[]> {
      return tscArgvOf(repo, stepFn(buildScript(repo, name).exec), name);
    }

    /** The same recording harness for any step, so the `compile` case below reuses it rather than
     *  carrying a second copy of the fake context. */
    async function tscArgvOf(repo: Repository, step: RunStepFn, name = 'pkg-a'): Promise<string[]> {
      const calls: string[][] = [];
      const pkg = repo.getPackage(name)!;
      const ctx = {
        pkg,
        repository: repo,
        cwd: pkg.dirname,
        runBin: async (bin: string, argv: string[]) => {
          calls.push([bin, ...argv]);
          return { code: 0, output: '' };
        },
        /** A partial context, cast: the step reads `pkg` and `runBin` and nothing else, and a real
         *  `Logger` here would only be a second thing to keep in step with rman. */
        logger: undefined,
      } as unknown as RunStepContext;
      await step(ctx);
      return calls[0];
    }

    /**
     * The `after` hook copies README/LICENSE into the built package, and **where** that is has to
     * be the directory `publish` will ship - not the word `build`.
     *
     * A repository overriding `vars.buildDir` moves `publish.npm.directory` and `clean.include`
     * with it, so a hardcoded destination would copy into a directory `tsc` never created:
     * `copyFileSync` throws ENOENT and the build fails at its last step. The hook reads the
     * package's own resolved key instead.
     */
    it('copies into the directory publish ships, even when the repository renames it', async () => {
      const dir = fixtureDir({
        /* **The override goes in a selector block, and an unmarked `vars` will not do.** This
         * config declares its own `vars` inside `"[platform:node]"`, and rman resolves an unmarked
         * key as the level's floor beneath every selector block at that level - including one that
         * arrived through `extends`. Measured both ways against a real repository: unmarked leaves
         * `publish.npm.directory` at `build`, `"[platform:node]"` or `"[*]"` both give `dist`. */
        rmanrc: `extends: '@panates/rman-preset'\n"[platform:node]":\n  vars:\n    buildDir: dist\n`,
        files: { 'README.md': '# demo', 'packages/pkg-a/dist/.keep': '' },
      });
      const repo = await Repository.create(dir);
      const pkg = repo.getPackage('pkg-a')!;
      expect(pkg.config.publish?.npm?.directory).toBe('dist');

      const after = afterHook(repo);
      after({ pkg, repository: repo });

      expect(fs.existsSync(path.join(pkg.dirname, 'dist', 'README.md'))).toBe(true);
    });

    /**
     * **The build directory gets a manifest of its own**, so it is a complete package: `node
     * build/index.js` needs one beside it to pick up `"type": "module"`, and what a release will
     * contain can be read without running a publish.
     *
     * It never decides what ships. `rman publish` derives its own into the same file and its
     * `preparePublishManifest` reads whatever is already there first, writing it back when the
     * publish ends - so this copy is borrowed for the duration and restored, never published and
     * never deleted.
     */
    /**
     * **Every form of a `copyFiles` entry, in one fixture.** The string DSL's whole addition over a
     * bare path is `>`; a trailing `/` on the destination is what says "directory".
     *
     * The glob is written quoted on purpose and the case would not load otherwise: `*` is YAML's
     * alias indicator, so `- *.md > doc/` fails with `bad indentation of a mapping entry` - the
     * same rule that makes `"[*]"` selectors need quotes. Measured before the DSL was designed.
     */
    it('copies each copyFiles form to where it says', async () => {
      const dir = fixtureDir({
        rmanrc: [
          `extends: '@panates/rman-preset'`,
          `"[platform:node]":`,
          `  vars:`,
          `    copyFiles:`,
          `      - README.md`,
          `      - LICENSE > doc/LICENCE.txt`,
          `      - CHANGES.md, NOTICE > legal/`,
          `      - '*.md > every/'`,
          `      - { from: assets, to: assets }`,
          ``,
        ].join('\n'),
        files: {
          'packages/pkg-a/README.md': '# a',
          'packages/pkg-a/CHANGES.md': 'changes',
          'packages/pkg-a/NOTICE': 'notice',
          'packages/pkg-a/assets/logo.svg': '<svg/>',
          'packages/pkg-a/assets/icons/star.svg': '<svg/>',
          LICENSE: 'MIT',
        },
      });
      const repo = await Repository.create(dir);
      const pkg = repo.getPackage('pkg-a')!;

      const after = afterHook(repo);
      after({ pkg, repository: repo });

      const at = (...p: string[]) => fs.existsSync(path.join(pkg.dirname, 'build', ...p));

      /** A bare path keeps the old shape: basename, at the build root. */
      expect(at('README.md')).toBe(true);
      /** No trailing slash - the destination is the file's own path, renamed and all. */
      expect(at('doc', 'LICENCE.txt')).toBe(true);
      /** Several sources, one directory. NOTICE is found in the package, LICENSE at the root. */
      expect(at('legal', 'CHANGES.md')).toBe(true);
      expect(at('legal', 'NOTICE')).toBe(true);
      /** The glob reaches both .md files and flattens them to basenames. */
      expect(at('every', 'README.md')).toBe(true);
      expect(at('every', 'CHANGES.md')).toBe(true);
      /** The object form copies a directory as it stands, nested entries included. */
      expect(at('assets', 'logo.svg')).toBe(true);
      expect(at('assets', 'icons', 'star.svg')).toBe(true);
    });

    /**
     * **The package exports it**, so a repository can copy files this way from its own `.rmanrc`
     * without going through this config's build hook. Asserted through the package root rather
     * than the module, because the root is the surface a consumer has.
     */
    it('exports copyFiles for a repository to use directly', async () => {
      const { copyFiles } = await import('../index.js');
      expect(typeof copyFiles).toBe('function');

      const dir = fixtureDir({ files: { 'a/README.md': '# a', 'a/NOTES.md': 'n' } });
      const into = path.join(dir, 'out');
      copyFiles(['README.md', "'*.md' > doc/".replace(/'/g, '')], { into, lookIn: [path.join(dir, 'a')] });

      expect(fs.existsSync(path.join(into, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(into, 'doc', 'NOTES.md'))).toBe(true);
    });

    /**
     * **The build directory's version constant is rewritten to `package.json`'s version.**
     *
     * Not a replacement for `rman version`, which stamps the *source* and commits it so the tagged
     * commit records what shipped - and `@v3` releases Version -> Build -> Publish, so the published
     * artifact is already right and this changes nothing there. What it is for is the build
     * directory *between* releases, which is what a person debugs: a repository that keeps a
     * placeholder in its source has a `build/` reporting the wrong version until a bespoke postbuild
     * script fixes it. rman's own is exactly that - `src/constants.ts` reads
     * `export const version = '1'` and `support/postbuild.cjs` bakes the real one in.
     *
     * The fixture uses a placeholder for that reason: with a source already carrying the right
     * version the call is a no-op, which is correct and proves nothing.
     */
    it('stamps the build directory with the package.json version', async () => {
      const dir = fixtureDir({
        rmanrc: `extends: '@panates/rman-preset'\n`,
        files: { 'packages/pkg-a/build/constants.js': "export const version = '1';\n" },
      });
      const repo = await Repository.create(dir);
      const pkg = repo.getPackage('pkg-a')!;

      const after = afterHook(repo);
      after({ pkg, repository: repo });

      const written = fs.readFileSync(path.join(pkg.dirname, 'build', 'constants.js'), 'utf-8');
      expect(written).toBe(`export const version = '${pkg.version}';\n`);
      /** Read off the manifest, not invented - the one place a package's version is authoritative. */
      expect(pkg.version).toBeTruthy();
    });

    /**
     * **Silence is the contract here, and it is the opposite of `version.stamp`'s.** That key errors
     * on a file it cannot rewrite, because there a repository named a *source* file it expects to be
     * stamped and silence would ship a stale constant on every release. This is derived output, the
     * source has already had its say, and a build must not fail over a convention the package never
     * adopted - most packages have no `constants.js` at all.
     */
    it('says nothing when there is no constants.js, or no version constant in it', async () => {
      const dir = fixtureDir({
        rmanrc: `extends: '@panates/rman-preset'\n`,
        files: {
          'packages/pkg-a/build/.keep': '',
          'packages/pkg-b/build/constants.js': "export const OTHER = '1';\n",
        },
      });
      const repo = await Repository.create(dir);

      for (const name of ['pkg-a', 'pkg-b']) {
        const pkg = repo.getPackage(name);
        if (!pkg) continue;
        const after = afterHook(repo, name);
        expect(() => after({ pkg, repository: repo })).not.toThrow();
      }
      const untouched = path.join(dir, 'packages/pkg-b/build/constants.js');
      if (fs.existsSync(untouched)) expect(fs.readFileSync(untouched, 'utf-8')).toBe("export const OTHER = '1';\n");
    });

    /** **The package exports it**, like `copyFiles`, so a repository stamping something
     *  `vars.stampFiles` does not cover can call it from its own hook. */
    it('exports stampFiles for a repository to use directly', async () => {
      const { stampFiles } = await import('../index.js');
      expect(typeof stampFiles).toBe('function');

      const dir = fixtureDir({ files: { 'out/constants.js': "export const version = '0.0.0';\n" } });
      const into = path.join(dir, 'out');
      const stamped = stampFiles(['constants.js', 'missing.js'], { into, version: '4.5.6' });

      expect(stamped).toEqual([path.join(into, 'constants.js')]);
      expect(fs.readFileSync(path.join(into, 'constants.js'), 'utf-8')).toBe("export const version = '4.5.6';\n");
    });

    /** Several sources with a file destination is a mistake, not five files racing for one path. */
    it('refuses a multi-source entry whose destination is a single file', async () => {
      const dir = fixtureDir({
        rmanrc: [
          `extends: '@panates/rman-preset'`,
          `"[platform:node]":`,
          `  vars:`,
          `    copyFiles:`,
          `      - README.md, NOTICE > doc/one.txt`,
          ``,
        ].join('\n'),
        files: { 'packages/pkg-a/README.md': '# a', 'packages/pkg-a/NOTICE': 'notice' },
      });
      const repo = await Repository.create(dir);
      const pkg = repo.getPackage('pkg-a')!;

      const after = afterHook(repo);
      expect(() => after({ pkg, repository: repo })).toThrow(/destination is a single file/);
    });

    it('writes a consumer-shaped package.json into the build directory', async () => {
      const dir = fixtureDir({
        rmanrc: `extends: '@panates/rman-preset'\n`,
        files: { 'packages/pkg-a/build/.keep': '' },
      });
      const repo = await Repository.create(dir);
      const pkg = repo.getPackage('pkg-a')!;

      const after = afterHook(repo);
      after({ pkg, repository: repo });

      const written = path.join(pkg.dirname, 'build', 'package.json');
      expect(fs.existsSync(written)).toBe(true);
      const json = JSON.parse(fs.readFileSync(written, 'utf-8'));

      /** The identity a consumer resolves the package by survives. */
      expect(json.name).toBe(pkg.name);
      expect(json.version).toBe(pkg.version);

      /** Everything a consumer has no use for is dropped - the same set publish drops. */
      expect(json.devDependencies).toBeUndefined();
      expect(json.private).toBeUndefined();
      expect(json.publishConfig?.directory).toBeUndefined();
    });

    /**
     * The hook names `rman check` and `rman lint`, which is only safe because this package now
     * *contributes* them - see the `commands` suite below. It used to ship them and leave the
     * repository to install each as a `.rman/<name>.mjs` re-export, so a repository that wrote
     * nothing but the `extends` got `Did you mean clean?` from its very first build.
     */
    it('names the commands this package contributes, so a bare `extends` builds', async () => {
      const repo = await repositoryFor();
      const before = stepsOf(buildScript(repo).before);
      expect(before).toEqual(expect.arrayContaining(['rman check', 'rman lint']));
    });

    /**
     * **`tsc` waits for the dependencies; nothing before it does.** This is the one case here about
     * the *shape* of a step rather than what it does, and it has to exist: every other case reads
     * through `stepsOf`, which unwraps the object form and would be just as happy with the markers
     * deleted.
     *
     * Deleted, the build is wrong in a way that does not look like a config mistake. `tsc -b` runs
     * in every package at once, the ones whose dependencies are not compiled yet fail with
     * `Cannot find module '@scope/...'`, and the reader goes looking at imports. Measured on
     * `panates/opra`, where a dependency cycle produced the same collapse: sixteen of twenty
     * packages started inside the same tenth of a second.
     *
     * The mirror half is just as deliberate: `rman check`/`lint`/`clean` have no reason to wait for
     * anything, and under one blanket `topo` they waited for the whole dependency chain before the
     * first one could start.
     *
     * **Said at the script, not on `exec`**, and that needs rman 2.11: the barrier is the first step
     * marked `true`, else the first *unmarked* one, which takes `run.build.topo`. So `exec` is left
     * unmarked - which also keeps the wait when a package's own `build` script replaces it, a
     * `package.json` script having no way to say `topo`. Under 2.10 one `false` freed every step and
     * this shape waited nowhere.
     */
    it('waits for the dependencies at tsc, and not before it', async () => {
      const repo = await repositoryFor();
      const build = buildScript(repo);
      const topoOf = (value: unknown) =>
        (Array.isArray(value) ? value : [value]).map((item) => (item as RunStepObject | undefined)?.topo);

      expect(build.topo).toBe(true);
      expect(topoOf(build.exec)).toEqual([undefined]);
      /** Every other step says `false` explicitly, which is what makes `exec` the first unmarked one
       *  - rman reads that as the barrier. */
      expect(topoOf(build.before)).toEqual([false, false, false]);
      expect(topoOf(build.after)).toEqual([false]);
    });

    /**
     * **`compile` is plain `tsc`, and each of the three things it is not was measured wrong.**
     *
     * `tsc -b --noEmit` cannot run at all: in build mode `--noEmit` applies to the whole graph and
     * TypeScript refuses it for a project something else references - `error TS6310: Referenced
     * project '...' may not disable emit` on every package with a `references` entry, which is to
     * say every package a project-references monorepo has, the shape this preset is for.
     *
     * `--noEmit` on its own cannot see its siblings: a `references` entry resolves to the referenced
     * project's declaration **output**, so on an unbuilt `panates/opra` it produced 46 `TS6305` and
     * 88 `TS2307` cascading from them, not one of which is a type error anybody can act on.
     * Emitting is what gives the next package something to read.
     *
     * `tsconfig-build.json` is `build`'s, written for a publishable artifact and resolving a sibling
     * through its output; the package's own `tsconfig.json` maps the same sibling through `paths`
     * and is what the editor reads, so `rman compile` answers the question the editor already does.
     *
     * Asserted on the argv, because all three mistakes are one or two characters there.
     */
    it('compiles with plain tsc - no -b, no --noEmit, no build config', async () => {
      const repo = await repositoryFor();
      const compile = repo.getPackage('pkg-a')?.config.run?.compile as RmanConfig.RunScriptOptions;
      const argv = await tscArgvOf(repo, stepFn(compile.exec));

      /** `--noEmitOnError` and nothing else: the emit is a side effect of `references` resolving to
       *  declaration output, not the point of the command, so a package with type errors must not
       *  leave half a build in the directory `publish` ships from. */
      expect(argv).toEqual(['tsc', '--noEmitOnError']);
      /** It emits, so a dependent reading its declarations has to wait - the one reason this is
       *  ordered where `check`, which reads only a package's own sources, is not. Said at the
       *  script; its one step is unmarked and so waits before it. */
      expect(compile.topo).toBe(true);
      expect(
        (Array.isArray(compile.exec) ? compile.exec : [compile.exec]).map((s) => (s as RunStepObject).topo),
      ).toEqual([undefined]);
    });
  });

  /**
   * **The commands arrive with the config**, under its `commands` key - so a repository writing one
   * `extends` line gets `rman check`/`lint`/`format` with no `.rman/` directory of its own.
   *
   * **This was a plugin until rman 2.0, and the key replaced it.** `commands` takes a command or a
   * glob naming modules that export one, always appends, and is read from every level - so a
   * package contributing commands declares them beside the rest of its config and needs no
   * `init`. What the spec can read changed with it: there is no `pluginCommands` on a repository
   * any more, because a contributed command is a config value like every other.
   *
   * Asserted on the resolved config rather than by running the CLI because that is where the
   * contribution is made: a command missing from here never reaches yargs at all. The last case
   * runs the CLI as well, for the one thing the config cannot show - that yargs took them.
   */
  describe('commands', () => {
    it('contributes check, format and lint, with no .rman directory needed', async () => {
      const repo = await repositoryFor();
      expect(declaredCommandNames(repo)).toEqual(expect.arrayContaining(['check', 'format', 'lint', 'test']));
    });

    /**
     * **Declared, not built.** `cli.ts` decides by `typeof entry === 'function'`, and the
     * declarative factory is the form to write: options as data, so the flag list cannot drift from
     * what the handler reads. These were hand-written `builder` chains until rman 2.0.
     */
    it('declares them, rather than shipping hand-written builders', async () => {
      const repo = await repositoryFor();
      expect(commandEntries(repo).every((entry) => typeof entry === 'function')).toBe(true);
    });

    /**
     * **rman's own `ci` and `clean` survive ours**, because `commands` appends across layers -
     * including the presets rman lays under every repository root, which is where those two come
     * from in 2.x (they were `rman-node`'s while that was a separate package). Seven entries, not
     * five.
     *
     * Worth its own case because the count is the part that looks wrong. Replacement was the
     * silent failure the append rule exists to prevent: a config adding a command of its own would
     * otherwise drop every command it inherited, and what the author would notice is
     * `Unknown argument: clean` from a build step they never touched.
     */
    it('appends to the commands it inherits rather than replacing them', async () => {
      const repo = await repositoryFor();
      expect(declaredCommandNames(repo)).toEqual(['ci', 'clean', 'check', 'compile', 'format', 'lint', 'test']);
    });

    /**
     * **`compile` is an alias for `run compile` and owns nothing of its own.**
     *
     * The flags are the part worth pinning. `--parallel`, `--bail`, `--topo`, `--changed` and the
     * package filters are what make `run` usable, and an alias supporting fewer of them than the
     * command it stands for is a trap: the flag works on `rman run compile`, does nothing on
     * `rman compile`, and nothing reports the difference. Taking rman's own `runOptions` is what
     * keeps the two in step; restating them here would be two lists free to drift.
     */
    it('carries the whole run option group rather than a copy of part of it', async () => {
      const repo = await repositoryFor();
      const compile = declaredCommand(repo, 'compile');

      expect(Object.keys(compile.config ?? {})).toEqual(Object.keys(runOptions));
    });

    /** Its settings are `run.compile`, which belongs to `run` - the same reason rman's own `build`
     *  declares the key it reads and contributes none. */
    it('reads run.compile and contributes no config key of its own', async () => {
      const repo = await repositoryFor();
      const compile = declaredCommand(repo, 'compile');

      expect(compile.configKeys).toEqual(['run.compile']);
    });

    /**
     * **`test` takes rman's own `test`, and that is the point of it.**
     *
     * rman's built-in is an alias for `run test`, which fans the script out over the packages.
     * Measured across seven repositories of this organization: not one has a package with its own
     * `test` script, because testing here is a single run at the repository root - so `rman test`
     * answered `No package defines a "test" script.` and everyone typed `npm test` instead.
     *
     * Taking the name used to throw ("would shadow rman's built-in"), which is the wall `lint` hit
     * before it stopped being an alias. rman 2.3 made `build` and `test` shadowable: they are the
     * two built-ins that carry no logic of their own.
     *
     * **One row in `--help`, not two.** Both were registered until rman skipped a shadowed
     * built-in, and a name listed twice with two descriptions says nothing about which runs.
     */
    it('takes the built-in test alias, and leaves one row in --help', async () => {
      const repo = await repositoryFor();
      const { stdout } = await runRman(repo.dirname, '--help');

      const rows = stdout.split('\n').filter((l) => /^\s+rman test\b/.test(l));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain('package you are in');
    });

    /**
     * **The package you are standing in, not every package** - the one command here that works that
     * way, and deliberately: a cycle and a lint rule are repository-wide facts, a test run is the
     * thing you narrow while working. At the root that is the repository's own script.
     *
     * Asserted through the error rather than by running a suite: the fixture's packages have no
     * test runner, and what the case is about is *which manifest was consulted*, which the message
     * names. `rman run test` is offered in it, because that is the behaviour being replaced.
     */
    it('reads the script from the package you are in, and says which when there is none', async () => {
      const repo = await repositoryFor();
      const { stderr } = await runRman(repo.dirname, 'test').catch((e: { stderr: string }) => e);
      expect(stderr).toContain('has no "test" script');
      /** The root's name, not a package's - `currentPackage` is undefined there. */
      expect(stderr).toContain(repo.name!);
      expect(stderr).toContain('rman run test');
    });

    /** Standing inside a package names *that* package, which is the half that proves it is not
     *  reading the root's manifest and calling it the answer. */
    it('names the package when run from inside one', async () => {
      const repo = await repositoryFor();
      const pkg = repo.getPackage('pkg-a')!;
      /** **The CLI from the repository root, the cwd from the package.** `runRman` derives the cli
       *  path from its `cwd`, and a workspace member has no `node_modules/rman` of its own - the
       *  first draft of this case failed with `Cannot find module .../packages/pkg-a/node_modules/
       *  rman/cli.js`, which is the fixture's shape rather than anything about the command. */
      const cli = path.join(repo.dirname, 'node_modules', 'rman', 'cli.js');
      const { stderr } = await promisify(execFile)(process.execPath, [cli, 'test'], {
        cwd: pkg.dirname,
      }).catch((e: { stderr: string }) => e);

      expect(stderr).toContain('"pkg-a" has no "test" script');
    });

    /** `--script` is how the coverage run is reached, since `citest` is the name this organization
     *  gives it - and the message has to name the script that was actually looked for. */
    it('looks for the script --script names', async () => {
      const repo = await repositoryFor();
      const { stderr } = await runRman(repo.dirname, 'test', '--script', 'citest').catch((e: { stderr: string }) => e);
      expect(stderr).toContain('has no "citest" script');
    });

    /**
     * **Written out as instances, never as a glob** - and the difference is what a repository
     * inheriting this config keeps.
     *
     * Only a *glob* replaces rman's `.rman/*.{js,mjs,cjs}` default: `commands` appends across
     * layers but not onto a built-in fallback, so `commands: './commands/*.js'` here would
     * silently take away the `.rman/` directory of every repository that inherits it. Instances go
     * in a separate list and leave the default alone. Measured both ways; pinned because the glob
     * form is the tidier-looking one and nothing else would report the loss.
     */
    it('declares no glob, so an inheriting repository keeps its own .rman directory', async () => {
      const repo = await repositoryFor({ files: { '.rman/hello.mjs': HELLO_COMMAND } });
      expect(commandEntries(repo).filter((entry) => typeof entry === 'string')).toEqual([]);

      const { stdout } = await runRman(repo.dirname, '--help');
      expect(stdout).toMatch(/\bhello\b/);
      for (const name of ['check', 'format', 'lint']) expect(stdout).toContain(name);
    });
  });
});
