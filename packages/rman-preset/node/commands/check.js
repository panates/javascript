import fs from 'node:fs';
import path from 'node:path';
import {
  filterPackages,
  fromRootOption,
  packageFilterOptions,
  parallelOptions,
  readFromRootOption,
  readPackageFilterOptions,
  readParallelOptions,
} from 'rman';

/** dpdm's flags, as defaults so no repository has to restate them.
 *
 *  `circular --exit-code circular:1` is the load-bearing one: without it dpdm *reports* a cycle and
 *  still exits 0, so a CI step would pass on a repository that has one. The rest is noise control -
 *  `-T` takes paths from tsconfig, `--no-warning`/`--no-tree` drop the output that isn't the answer,
 *  and `--skip-dynamic-imports` keeps a lazy `import()` from counting as a cycle. */
const DPDM_FLAGS = [
  '-T',
  '--no-warning',
  '--no-tree',
  '--skip-dynamic-imports',
  'circular',
  '--exit-code',
  'circular:1',
];

const DEFAULT_ENTRY = './src/index.ts';

const COMMAND = 'check';

/**
 * **The shared groups are spread rather than restated**, which is what `packageFilterOptions` and
 * `fromRootOption` are exported for: a plugin's command narrows packages with the same
 * `--scope`/`--ignore`/`--deps`/`--dependents` every built-in has, spelled and behaving the same
 * way, instead of the hand-rolled selection this command used to do.
 *
 * @satisfies {Record<string, import('rman').CommandOption>}
 */
const config = {
  ...packageFilterOptions,
  ...fromRootOption('Check'),
  ...parallelOptions,
  concurrency: {
    target: 'config',
    describe: 'How many packages dpdm runs in at once when --parallel is not given.',
    type: 'number',
  },
  entry: {
    target: 'cli',
    alias: 'e',
    describe: `Entry point dpdm walks, relative to each package. Default "${DEFAULT_ENTRY}".`,
    type: 'string',
    default: DEFAULT_ENTRY,
  },
  changed: {
    target: 'cli',
    alias: 'c',
    describe: 'Only packages with uncommitted or unpushed changes',
    type: 'boolean',
  },
};

/**
 * `rman check` - dpdm's circular-dependency check, once per package.
 *
 * Per package rather than once at the root because dpdm walks a single entry point: each package
 * has to be asked about its own. Standing inside a package checks only that one - and unlike
 * `format`/`lint`, which never iterate packages, this one therefore *does* take `--from-root` and
 * the package filter, because both mean something here.
 *
 * dpdm is run directly rather than through a `check` script, so nothing has to appear in `.rmanrc`
 * for this to work - the command owns its tool, the way `format` owns prettier.
 *
 * **The packages are scheduled by rman, not by a loop here** (`context.forEachPackage`), so
 * `--parallel`, `--bail` and the progress panel all work and none of them is implemented twice.
 * This used to be `for (const pkg of ...) await runBin(...)`, and the comment that justified it -
 * "dpdm is fast, so sequence is the honest shape" - was wrong by a factor of the package count:
 * measured on `panates/opra`, nineteen packages at 0.4-0.9s each, eleven seconds of wall clock for
 * work with no dependencies between any of it. Ordering stays off (the default) for exactly that
 * reason: dpdm reads a package's own sources, so nothing here waits for anything.
 *
 * **Declared, not built** - see [`format.js`](./format.js) for the shape.
 *
 * @param {import('rman').RmanApplication} app
 */
export default (app) => {
  const repository = app.repository;
  return {
    command: COMMAND,
    platform: 'node',
    describe: 'Checks each package for circular dependencies with dpdm',
    config,
    examples: [
      { command: '$0 check' },
      { command: '$0 check --changed', description: '# Only what you have touched' },
      { command: '$0 check --scope pkg-a', description: '# One package, from anywhere' },
      { command: '$0 check --from-root', description: '# Every package, from inside one' },
      { command: '$0 check --no-bail', description: '# Report every package, not just the first bad one' },
      { command: '$0 check -e ./src/main.ts', description: '# A package that enters somewhere else' },
    ],
    /**
     * @param {import('rman').ArgsOf<typeof config, typeof COMMAND>} args
     * @param {import('rman').CommandContext} context
     */
    handler: async (args, context) => {
      const logger = context.logger;

      /**
       * Read once rather than at each of the three uses.
       *
       * The `??` is not a second statement of the default - `ArgsOf` types every declared option
       * as optional whatever it declares, so `default: DEFAULT_ENTRY` above does not narrow it.
       * That is an rman typing gap, not a runtime one: yargs has already filled the value in by
       * the time the handler runs, for any option that is a flag.
       */
      const entry = args.entry ?? DEFAULT_ENTRY;

      /** The same rule `run`/`clean`/`changelog` follow: standing inside one package scopes the
       *  command to it, and `--from-root` is the way back out. */
      const current = readFromRootOption(args) ? undefined : repository.currentPackage;
      let packages = current ? [current] : repository.getPackages();
      packages = filterPackages(packages, readPackageFilterOptions(args));

      if (args.changed) {
        const status = await repository.listStatus();
        packages = packages.filter((pkg) => status[pkg.name] !== 'clean');
      }

      /** A package without the entry file has nothing to walk - skipped rather than handed to dpdm,
       *  which would fail on it. Counted, so "every package was skipped" can't read as success. */
      const checkable = packages.filter((pkg) => fs.existsSync(path.resolve(pkg.dirname, entry)));
      const skipped = packages.length - checkable.length;

      if (!checkable.length) {
        /** The two endings, kept apart the way rman's own `run` keeps them: nothing to check because
         *  a filter excluded everything is the correct answer to what was asked, and exits 0. No
         *  package having an entry point at all is a mistake - a wrong `--entry`, or this command
         *  pointed at a repository it doesn't fit - and must not pass. */
        if (packages.length) {
          const message = `No package has "${entry}" - nothing to check.`;
          console.error(message);
          throw loggedError(message);
        }
        logger.info(`Nothing to check - every package was filtered out.`);
        return;
      }

      /**
       * **rman schedules this, not a loop here** - so `--parallel`, `--bail` and the progress panel
       * come from the one implementation of them. What went with the loop: a hand-rolled tally
       * (whose `notRun` arithmetic reported packages a bail had skipped as successes until it was
       * fixed here separately), a `logger.info` per package, and the summary line - all of which the
       * panel's own recap already prints, per package and with the failing output replayed.
       */
      await context.forEachPackage(
        checkable,
        async ({ pkg, runBin }) => {
          try {
            await runBin('dpdm', [...DPDM_FLAGS, entry]);
          } catch (e) {
            /**
             * **Only dpdm's own verdict counts as a cycle.** It exits 1 for one (that is what
             * `--exit-code circular:1` buys), so anything else - dpdm not installed, a bad
             * `--entry`, a crash - is a different failure and is re-thrown under its own name.
             * Reported as a cycle it sent the reader looking for an import loop that was not there:
             * measured, a repository without dpdm answered `Circular dependencies in pkg-a`.
             *
             * `code` is the child's exit status, which `runBin` puts on the rejection; a binary it
             * could not spawn at all rejects with a plain `Error` that has none, so `!== 1` catches
             * that too.
             */
            if (/** @type {{ code?: number } | undefined} */ (e)?.code !== 1) throw e;
            /** Thrown rather than collected: the scheduler is what counts failures now, and dpdm's
             *  own output - which names the cycle - is already in this package's row and replayed
             *  at the end. A message of our own here would only bury it. */
            throw loggedError(`circular dependency in ${pkg.name}`);
          }
        },
        {
          label: COMMAND,
          ...readParallelOptions(args),
          /** The flag wins, and `check.concurrency` is the standing answer when it is not given -
           *  the command's own key, read off the root, because there is one scheduler and one answer
           *  for the whole batch. Not `run.check`: `check` is a command, not a script. */
          parallel: readParallelOptions(args).parallel ?? repository.rootPackage.config.check?.concurrency,
          logLevel: args.logLevel,
        },
      );

      /** The one count the panel cannot know: a package with no entry file was never handed to the
       *  scheduler at all, and "every package was skipped" must not read as a clean check. */
      if (skipped) logger.info(`${skipped} skipped (no ${entry})`);
    },
  };
};

/**
 * An `Error` rman prints once and no more.
 *
 * `logged` is rman's convention for "the user has already seen this message" - `runCli` checks it
 * before printing, so a command that reported its own failure and then threw does not have it
 * echoed a second time. It is not a property of `Error`, so in a checked JavaScript file it has to
 * be attached through a cast; one helper does that in one place rather than at every throw site.
 */
function loggedError(message) {
  const error = /** @type {Error & { logged?: boolean }} */ (new Error(message));
  error.logged = true;
  return error;
}
