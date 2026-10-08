import fs from 'fs';
import path from 'path';
import { copyAssets } from 'rman';
import checkCommand from './commands/check.js';
import compileCommand from './commands/compile.js';
import formatCommand from './commands/format.js';
import lintCommand from './commands/lint.js';
import testCommand from './commands/test.js';
import { copyFiles } from './copy-files.js';
import { stampFiles } from './stamp-files.js';

/**
 * @type {import('rman').RmanNodeConfig}
 */
export default {
  '[platform:node]': {
    /* `testCommand` shadows rman's built-in `test` alias, which is an alias for `run test` and
     * carries no logic of its own - rman 2.3 made the two run aliases shadowable for exactly this.
     * `rman run test` still fans the script out, for a repository whose tests are per package. */
    commands: [checkCommand, compileCommand, formatCommand, lintCommand, testCommand],

    vars: {
      coveragePath: '${{ path.join(repository.dirname, "coverage") }}',
      buildDir: 'build',
      copyFiles: ['README.md', 'LICENSE'],
      /* Globs under the tsconfig's `rootDir` copied into its `outDir` after the compile - the files
       * `tsc` does not emit (translations, XML templates, fixtures). Unset means rman's own
       * `DEFAULT_ASSET_PATTERNS`: json, xml, yaml, yml. */
      assets: undefined,
      /* Paths inside the build directory whose version constant is rewritten after a build - see
       * `stampFiles`. `constants.js` because `src/constants.ts` is this organization's convention
       * and tsc's `rootDir`/`outDir` puts it there; a package without one is skipped in silence. */
      stampFiles: ['constants.js'],
    },

    '[/]': {
      clean: {
        include: '${{ [...value, vars.coveragePath] }}',
      },
    },

    '[*]': {
      version: {
        /* **`optional`, because this line is written on forty repositories' behalf.** A listed file
         * that exists and holds nothing rewritable is normally an error - which is right when a
         * repository names the path itself, since a typo or a renamed identifier would otherwise
         * ship a stale constant on every release. Here the asker is a preset that cannot know which
         * of its consumers keeps a version constant in `src/constants.ts`; it means "stamp it where
         * there is one". Measured on `panates/postgrejs`: the file exists, has never held one, and
         * `rman version` refused the release over a line nobody in that repository wrote. */
        stamp: [{ file: 'src/constants.ts', optional: true }],
      },

      publish: {
        npm: {
          directory: '${{ vars.buildDir }}',
        },
      },

      clean: {
        include: "${{ [...value, vars.buildDir, '*.tsbuildinfo', path.join(vars.coveragePath, pkg.basename)] }}",
      },

      run: {
        build: {
          topo: true,
          before: [
            {
              topo: false,
              command: 'rman check',
            },
            {
              topo: false,
              command: 'rman lint',
            },
            {
              topo: false,
              command: 'rman clean',
            },
          ],
          exec: buildWithTsc(),
          /* **`vars` is read off the package, not off the argument.** A function step is handed
           * exactly `pkg`, `repository`, `cwd`, `runBin` and `logger` - destructuring `vars` there
           * yields `undefined`, and the first `vars.readmeFile` throws. `pkg.config.vars` is the
           * resolved scope for this package, which is what the hook wanted in the first place. */
          after: {
            topo: false,
            command: async ({ pkg, repository, runBin }) => {
              /* Annotated because `vars` is free-form by contract - rman cannot know these two hold
               * strings, so without it `path.resolve(d, name)` is passed `{}`. */
              const vars = /** @type {Record<string, string | undefined>} */ (pkg.config.vars ?? {});
              const entries = vars.copyFiles ? (Array.isArray(vars.copyFiles) ? vars.copyFiles : [vars.copyFiles]) : [];
              const buildDir = pkg.config.publish?.npm?.directory ?? 'build';
              const buildPath = path.resolve(pkg.dirname, buildDir);
              copyFiles(entries, {
                into: buildPath,
                lookIn: [pkg.dirname, repository.dirname],
              });
              writeBuildManifest(pkg, buildDir);
              /* **Stamped here as well as by `rman version`, not instead of it.** `version` rewrites
               * the source and commits it, so the tagged commit records what shipped; `@v3` releases
               * Version -> Build -> Publish, so the published artifact is already right and this call
               * changes nothing there. What it is for is the build directory *between* releases, which
               * is what a person debugs: a repository keeping a placeholder in its source (rman's own
               * `src/constants.ts` reads `export const version = '1'`) otherwise has a `build/` that
               * reports the wrong version until a bespoke postbuild script fixes it. This is that
               * script, once, for every repository extending the preset. */
              stampFiles(
                vars.stampFiles ? (Array.isArray(vars.stampFiles) ? vars.stampFiles : [vars.stampFiles]) : [],
                {
                  into: buildPath,
                  /* `package.json`'s version, which is the one place a package's version is
                   * authoritative - a build can then never disagree with what is about to be published. */
                  version: pkg.version,
                },
              );
              /* **Last, so everything above stays synchronous.** The files `tsc` left in `src`,
               * copied to where the compiled code looks for them - see rman's `copyAssets`.
               * Skipped without a tsconfig, which a real build has already refused in `exec`. */
              const tsconfig = findTsconfig(pkg);
              if (tsconfig) {
                await copyAssets({
                  tsconfig,
                  patterns: vars.assets ? (Array.isArray(vars.assets) ? vars.assets : [vars.assets]) : undefined,
                  runBin,
                });
              }
            },
          },
        },
        /* **`build` without the packaging**: the compile step alone, with none of the `after` hook's
         * copying, manifest writing or version stamping. Ordered, and it has to be - a package reads
         * its siblings' emitted declarations, so each one must have compiled before the next starts.
         * See `compileWithTsc` for why that is plain `tsc` rather than `-b` or `--noEmit`. */
        compile: {
          topo: true,
          exec: compileWithTsc(),
        },
      },
    },
  },
};

function buildWithTsc(...args) {
  return async function ({ pkg, runBin }) {
    await runBin('tsc', ['-b', tsconfigFor(pkg), ...args]);
  };
}

/**
 * Compiles a package on its own: plain `tsc` in the package's own directory, against the
 * `tsconfig.json` an editor would use.
 *
 * **Not `tsc -b --noEmit`, which cannot work here at all.** In build mode `--noEmit` applies to the
 * whole graph, and TypeScript refuses it for a project something else references: measured on
 * `panates/opra`, every package with a `references` entry answered `error TS6310: Referenced
 * project '...' may not disable emit` - which is to say every package a project-references monorepo
 * has, the shape this preset exists for.
 *
 * **And not `--noEmit` at all.** A `references` entry always resolves to the referenced project's
 * declaration *output*, so a check that writes nothing cannot see a sibling that has not been built
 * - measured on an unbuilt `panates/opra`, 46 `TS6305: Output file has not been built from source
 * file` and 88 `TS2307` cascading from them, none of which is a type error anybody can act on. A
 * compile that emits produces exactly what the next package needs, so the chain answers for itself
 * and `topo` is what makes that work.
 *
 * **And not `tsconfig-build.json`, which `build` uses.** That config is written for emitting a
 * publishable artifact and resolves a sibling through its output; the package's own `tsconfig.json`
 * maps the same sibling through `paths` and is what the editor reads - so `rman compile` answers
 * the question the editor is already answering.
 */
function compileWithTsc(...args) {
  return async function ({ pkg, runBin }) {
    const tsconfig = path.join(pkg.dirname, 'tsconfig.json');
    if (!fs.existsSync(tsconfig)) {
      throw new Error(
        `${pkg.name} has no tsconfig.json - there is nothing for "tsc" to compile. Add one, or ` +
          `keep this package out with .rmanrc "[${pkg.name}]": { run: { compile: { skip: true } } }.`,
      );
    }
    /**
     * **`--noEmitOnError`, because the emit is a side effect rather than the point.** This command
     * exists to show type errors; it writes only because a `references` entry resolves to the
     * referenced project's declaration *output*, so a package cannot be checked until the ones
     * below it have emitted - measured on a fully cleaned `panates/opra`, `tsc --noEmit` answers
     * `TS6305`/`TS2307` in every package that has a reference. Given that it must write, it must
     * not write *garbage*: without this flag a package with type errors still emits, leaving half a
     * build in the very directory `publish` ships from.
     *
     * No `-p`: `runBin` is already bound to the package's directory, so tsc finds that
     * `tsconfig.json` itself - which is exactly what running `tsc` by hand there would do.
     */
    await runBin('tsc', ['--noEmitOnError', ...args]);
  };
}

/** The config `build` compiles from, preferring a build-specific one. **`compile` deliberately does
 *  not share this** - see `typecheckWithTsc` for why a check wants the editor's config instead. */
function tsconfigFor(pkg) {
  const tsconfig = findTsconfig(pkg);
  if (!tsconfig) {
    throw new Error(
      `${pkg.name} has none of ${TSCONFIG_CANDIDATES.join(', ')} - there is nothing for "tsc -b" to build. ` +
        `Add one, or keep this package out of the build with .rmanrc ` +
        `"[${pkg.name}]": { run: { build: { skip: true } } }.`,
    );
  }
  return tsconfig;
}

/** The tsconfig a build compiles `pkg` with - the first of the three names that exists - or
 *  `undefined` when it has none. */
function findTsconfig(pkg) {
  return TSCONFIG_CANDIDATES.map((name) => path.join(pkg.dirname, name)).find(fs.existsSync);
}

const TSCONFIG_CANDIDATES = ['tsconfig-build.json', 'tsconfig.build.json', 'tsconfig.json'];

/** The only lifecycle scripts a consumer's `npm install` runs, so the only ones worth keeping in a
 *  built package. https://docs.npmjs.com/cli/using-npm/scripts */
const CONSUMER_SCRIPTS = new Set(['preinstall', 'install', 'postinstall']);

/**
 * Writes the package's manifest into the build directory, stripped of everything a consumer has no
 * use for: `devDependencies`, `publishConfig.directory`, every script except the three install
 * hooks - and `private`, **only when the package declares a `publishConfig`**.
 *
 * **This is the manifest `rman publish` decides from** (rman >= 2.11.1): whether a package is
 * private is read here, not from its source. A package set up to be published (`publishConfig`)
 * that is also `private` is guarding its source tree against a stray `npm publish`, so the flag is
 * dropped and the package publishes; one with no `publishConfig` means it, keeps the flag, and is
 * skipped. At publish time rman writes its own derived manifest over this one and restores it
 * afterwards - the two apply the same rules, and must go on doing so, or the plan and the artifact
 * disagree about `private`.
 *
 * What it is for is the build directory being a complete package on its own: `node build/index.js`
 * needs a `package.json` beside it to pick up `"type": "module"`, and anything inspecting what a
 * release will contain can read it without running a publish.
 *
 * **`"workspace:"` ranges are deliberately left as they are.** Resolving them needs every package in
 * the repository, which is rman's job and which `publish` does on its own copy. A build-time
 * resolution would be a second implementation of it, free to disagree.
 */
function writeBuildManifest(pkg, buildDir) {
  const json = structuredClone(pkg.manifest.raw);

  delete json.devDependencies;
  if (json.publishConfig) delete json.private;

  if (json.scripts) {
    const kept = Object.fromEntries(Object.entries(json.scripts).filter(([name]) => CONSUMER_SCRIPTS.has(name)));
    if (Object.keys(kept).length) json.scripts = kept;
    else delete json.scripts;
  }

  if (json.publishConfig) {
    delete json.publishConfig.directory;
    if (!Object.keys(json.publishConfig).length) delete json.publishConfig;
  }

  const dir = path.resolve(pkg.dirname, buildDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json, undefined, 2) + '\n', 'utf-8');
}
