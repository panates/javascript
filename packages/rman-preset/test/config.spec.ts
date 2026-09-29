import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect } from 'expect';
import type { CommandEntry, RmanConfig, RunStepContext, RunStepFn } from 'rman';
import { Repository } from 'rman';
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

    it("stamps the version into each package's own source constant", async () => {
      const repo = await repositoryFor();
      expect(repo.getPackage('pkg-a')?.config.version?.stamp).toEqual(['src/constants.ts']);
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
      await (buildScript(repo).exec as RunStepFn)(ctx);
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

      const after = buildScript(repo).after as (ctx: { pkg: unknown; repository: unknown }) => void;
      after({ pkg, repository: repo });

      expect(fs.existsSync(path.join(pkg.dirname, 'dist', 'README.md'))).toBe(true);
    });

    /**
     * The hook names `rman check` and `rman lint`, which is only safe because this package now
     * *contributes* them - see the `commands` suite below. It used to ship them and leave the
     * repository to install each as a `.rman/<name>.mjs` re-export, so a repository that wrote
     * nothing but the `extends` got `Did you mean clean?` from its very first build.
     */
    it('names the commands this package contributes, so a bare `extends` builds', async () => {
      const repo = await repositoryFor();
      const before = buildScript(repo).before as string[];
      expect(before).toEqual(expect.arrayContaining(['rman check', 'rman lint']));
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
      expect(declaredCommandNames(repo)).toEqual(expect.arrayContaining(['check', 'format', 'lint']));
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
     * from in 2.x (they were `rman-node`'s while that was a separate package). Five entries, not
     * three.
     *
     * Worth its own case because the count is the part that looks wrong. Replacement was the
     * silent failure the append rule exists to prevent: a config adding a command of its own would
     * otherwise drop every command it inherited, and what the author would notice is
     * `Unknown argument: clean` from a build step they never touched.
     */
    it('appends to the commands it inherits rather than replacing them', async () => {
      const repo = await repositoryFor();
      expect(declaredCommandNames(repo)).toEqual(['ci', 'clean', 'check', 'format', 'lint']);
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
