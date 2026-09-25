import fs from 'fs';
import path from 'path';
import checkCommand from './commands/check.js';
import formatCommand from './commands/format.js';
import lintCommand from './commands/lint.js';

/**
 * Panates' rman configuration for a TypeScript monorepo.
 *
 * ```yaml
 * # .rmanrc.yml at the repository root
 * extends: '@panates/rman-node'
 * ```
 *
 * Everything here is merged *underneath* the file that names it, so a repository overrides any of
 * it by declaring the same key - and adds to a list without restating it by deriving from `value`,
 * which is whatever the layers underneath resolved to:
 *
 * ```yaml
 * extends: '@panates/rman-node'
 * '[*]':
 *   run:
 *     build:
 *       after: "${{ [...value, 'node ../../support/stamp-assets.mjs'] }}"
 * ```
 *
 * A plain object with a JSDoc type rather than an `import { defineConfig }` - it needs no runtime
 * dependency on rman to be type-checked, and rman is only a peer here.
 *
 * **`RmanNodeConfig`, not `RmanConfig`**, and that is what carries the `clean.*` and
 * `publish.npm.*` keys below. Those are the Node plugin's, contributed by `declare module 'rman'`,
 * and a `declare module` augmentation applies only where its module is in the program - so
 * annotating with rman's own type leaves every one of them `does not exist in type 'RmanConfig'`.
 * Naming the plugin's type is what pulls the augmentation in, with no runtime import.
 *
 * @type {import('rman').RmanNodeConfig}
 */
export default {
  plugins: ['node'],

  /**
   * The three commands this package ships - `rman check`, `rman format`, `rman lint` - declared by
   * the same config that already carries everything else.
   *
   * **This was a plugin, and rman 2.0 is what made one unnecessary.** `commands` is an `.rmanrc`
   * key now, taking a command or a glob naming modules that export one, so a package contributing
   * commands declares them where it declares its config. The plugin here was nothing but a
   * carrier: its whole `init` was `ctx.addCommand(...)` three times, and neither `addCommand` nor
   * the `PluginContext` that offered it exists any more. A plugin in 2.0 *is* a technology - a
   * manifest reader, a workspace provider, a version planner - and this package is none of those.
   * It uses `rman-node`'s, through the `extends` above.
   *
   * **Written out rather than as `'./commands/*.js'`, which also works and would be worse here.**
   * Only a *glob* replaces the `.rman/*.{js,mjs,cjs}` default - `commands` appends across layers,
   * but not onto a built-in fallback - so a config shipping its commands by glob would silently
   * take away the `.rman/` directory of every repository inheriting it. Instances never touch the
   * default. Measured both ways.
   *
   * Precedence is unchanged either way: a repository's own `.rman/check.mjs` still wins - it is
   * registered after these, and yargs takes the last. That is the intended escape hatch, and it is
   * why the re-export files this key replaced keep working; they are simply no longer necessary.
   * One wrinkle, measured rather than assumed: `rman --help` then lists `check` **twice**, once
   * with each description, because nothing de-duplicates two non-built-in commands by name.
   */
  commands: [checkCommand, formatCommand, lintCommand],

  vars: {
    coveragePath: '${{ path.join(repository.dirname, "coverage") }}',
    buildDir: 'build',
  },

  /**
   * The root package alone - and `"[/]"` rather than an unmarked key, because an unmarked key in a
   * shared config means *the directory that inherited it*: the root when a repository writes the
   * `extends` in its own `.rmanrc`, but that package when someone writes it in one. `"[/]"` is the
   * only spelling that stays put wherever this file is inherited from.
   *
   * The root owns the aggregate coverage directory; each package cleans its own subdirectory below.
   */
  '[/]': {
    clean: {
      include: '${{ [...value, vars.coveragePath] }}',
    },
  },

  /**
   * The packages below - never the root, since a glob names packages and the root is nobody's
   * child. Everything here describes a TypeScript package: a `build` directory to clean and publish
   * from, a `tsconfig` to compile, a `src/constants.ts` to stamp. The root has none of those, which
   * is why none of it is written unmarked - an unmarked key would reach the root as well.
   *
   * The cost, stated rather than hidden: in a **single-package** repository the root *is* the only
   * package, so `"[*]"` reaches nothing and this config contributes no build at all. That is the
   * right trade for a package whose whole subject is a monorepo.
   */
  '[*]': {
    /**
     * One version line for the whole repository. This is rman's default, so it is here as a
     * statement rather than a change - and it belongs under the selector, not at the top level:
     * `group` is read from each package's own config, and in a monorepo the root is not one of them.
     */
    group: true,

    version: {
      /**
       * Each package exports its own version from `src/constants.ts`; `rman version` rewrites it in
       * the same commit as the bump. Stamping the *source* is what keeps tests, ts-node and git
       * agreeing with what shipped. A package without the file is a silent no-op, so this is safe
       * to declare for all of them.
       */
      stamp: ['src/constants.ts'],
    },

    publish: {
      /**
       * `publish.npm.*`, not a bare `publish.directory` - a publish target's config block is named
       * after the target, the way `publish.docker.*` always was. rman 2.0 refuses the old spelling
       * rather than ignoring it, because ignoring it would fall back to the package's own directory
       * and push the *source tree* to npm.
       */
      npm: {
        /**
         * Published output is the build directory, and rman generates the manifest there itself at
         * publish time - so nothing in the repository has to write a second `package.json`.
         */
        directory: '${{ vars.buildDir }}',
      },
    },

    clean: {
      /**
       * `value` is what the layers underneath resolved to, and underneath a shared config there
       * are none - so this is the first layer, and `value` spreads as empty. It used to need a
       * `value ?? []` guard for that, and forgetting it made every rman command in such a
       * repository exit 1; rman answers with an empty array now, and still refuses to be a string
       * or a number so a non-list key cannot quietly get one.
       */
      include: "${{ [...value, vars.buildDir, '*.tsbuildinfo', path.join(vars.coveragePath, pkg.basename)] }}",
    },

    run: {
      build: {
        /**
         * `rman run check`/`lint` rather than the commands themselves, so a repository overriding
         * either script gets it here too. `rman clean` is the command directly - going through the
         * script would only start a second process to reach the same place.
         */
        before: ['rman check', 'rman lint', 'rman clean'],
        exec: buildWithTsc,
        /**
         * `${{ repository.dirname }}` rather than `../../`, which would silently copy nothing from
         * a package nested any deeper than `packages/<name>`.
         *
         * The destination is read back from the package's own resolved `publish.npm.directory`
         * rather than written as `'build'`, because that is the directory `publish` will actually
         * ship - a repository overriding `vars.buildDir` moves both, and a hardcoded `build` would
         * then copy into a directory `tsc` never created (measured: `copyFileSync` throws ENOENT).
         * A step function is handed `pkg`, not the config scope, so it reads the resolved key
         * rather than the `vars` entry behind it.
         */
        after: ({ pkg, repository }) => {
          const buildDir = pkg.config.publish?.npm?.directory ?? 'build';
          for (const name of ['README.md', 'LICENSE']) {
            const from = [pkg.dirname, repository.dirname].map((d) => path.join(d, name)).find(fs.existsSync);
            if (from) fs.copyFileSync(from, path.join(pkg.dirname, buildDir, name));
          }
        },
      },
    },
  },
};

/**
 * `tsc -b`, against whichever tsconfig the package happens to have.
 *
 * **A function step, and the whole reason is *when* it runs.** This was
 * `exec: 'tsc -b ${{ file.resolveFirst(...) }}'`, and `resolveFirst` throws when a package has
 * none - by design, so `tsc -b` is never left with no argument and quietly compiling the
 * directory's default instead. But a `${{ }}` expression is evaluated while the config *resolves*,
 * which every rman command does first, so one package without a tsconfig took down the whole
 * repository: measured on a monorepo holding a plain-JS package beside a TypeScript one, `rman
 * list`, `rman info`, `rman config` and `rman clean --dry-run` all exited 1, each reporting a
 * missing `tsconfig.json` in a package none of them was asking about. That is a shared config
 * reaching for something it cannot answer yet, which is the failure mode rman's own docs record
 * for `file.copyMany`.
 *
 * A function step runs when its turn comes, for one package, so the loud failure lands where it
 * belongs: `rman build` fails, naming the package, and nothing else in the repository is affected.
 * The danger that justified throwing early is gone too - there is no command line here for an
 * empty path to slip into.
 *
 * **It still throws rather than skipping**, which is a policy this config is not changing: a
 * package with no tsconfig may be a plain-JS package that has nothing to build, or a TypeScript
 * one whose tsconfig was forgotten, and nothing here can tell them apart. Throwing is the reading
 * the package's own suite has always pinned.
 */
async function buildWithTsc({ pkg, runBin }) {
  const candidates = ['tsconfig-build.json', 'tsconfig.build.json', 'tsconfig.json'];
  const tsconfig = candidates.map((name) => path.join(pkg.dirname, name)).find(fs.existsSync);
  if (!tsconfig) {
    throw new Error(
      `${pkg.name} has none of ${candidates.join(', ')} - there is nothing for "tsc -b" to ` +
        `build. Add one, or keep this package out of the build with .rmanrc ` +
        `"[${pkg.name}]": { run: { build: { skip: true } } }.`,
    );
  }
  await runBin('tsc', ['-b', tsconfig]);
}
