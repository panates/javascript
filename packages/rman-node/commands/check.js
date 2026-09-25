import fs from 'node:fs';
import path from 'node:path';
import {
  filterPackages,
  fromRootOption,
  Logger,
  packageFilterOptions,
  readFromRootOption,
  readPackageFilterOptions,
  resolveRootLogLevel,
  runBin,
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
  bail: {
    target: 'cli',
    describe: 'Stop at the first package with a cycle. Default true.',
    type: 'boolean',
    default: true,
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
 * for this to work - the command owns its tool, the way `format` owns prettier. Note what that
 * trades away: the packages are checked in sequence here, without `run`'s concurrency, topological
 * order or progress panel. dpdm is fast and its packages are independent, so sequence is the honest
 * shape for it - but a heavier per-package tool belongs in `run.<script>`, where that machinery
 * already exists.
 *
 * **Declared, not built** - see [`format.js`](./format.js) for the shape.
 *
 * @param {import('rman').RmanApplication} app
 */
export default (app) => {
  const repository = app.repository;
  return {
    command: COMMAND,
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
    /** @param {import('rman').ArgsOf<typeof config, typeof COMMAND>} args */
    handler: async (args) => {
      const logger = new Logger(args.logLevel ?? resolveRootLogLevel(repository));

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

      const failed = [];
      let succeeded = 0;
      for (const pkg of checkable) {
        logger.info(`check ${pkg.name}`);
        try {
          await runBin('dpdm', [...DPDM_FLAGS, entry], {
            cwd: pkg.dirname,
            app: repository.app,
            logLevel: args.logLevel,
          });
          succeeded++;
        } catch (e) {
          /**
           * **Only dpdm's own verdict counts as a cycle.** It exits 1 for one (that is what
           * `--exit-code circular:1` buys), so anything else - dpdm not installed, a bad `--entry`,
           * a crash - is a different failure and is re-thrown under its own name. Reported as a
           * cycle it sent the reader looking for an import loop that was not there: measured, a
           * repository without dpdm answered `Circular dependencies in pkg-a`.
           *
           * `code` is the child's exit status, which `runBin` puts on the rejection; a binary it
           * could not spawn at all rejects with a plain `Error` that has none, so `!== 1` catches
           * that too.
           */
          if (/** @type {{ code?: number } | undefined} */ (e)?.code !== 1) throw e;
          failed.push(pkg.name);
          /** `runBin` already printed dpdm's own output, which names the cycle - repeating the
           *  error here would only bury it. */
          if (args.bail) break;
        }
      }

      /** Counted, not derived from the totals: with `--bail` the packages after the failure were
       *  never run, and `checkable.length - failed.length` reported them as having succeeded
       *  (measured - "1 succeeded, 1 failed" when only one package had actually been checked). */
      const notRun = checkable.length - succeeded - failed.length;
      const summary =
        `${succeeded} succeeded, ${failed.length} failed` +
        (notRun ? `, ${notRun} not checked` : '') +
        (skipped ? `, ${skipped} skipped (no ${entry})` : '');
      logger.info(summary);

      if (failed.length) {
        const message = `Circular dependencies in ${failed.join(', ')}`;
        console.error(message);
        /** Marked logged so rman prints it once, and thrown so the exit code agrees with the summary
         *  above - a check that reports a failure and exits 0 is worse than no check. */
        throw loggedError(message);
      }
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
