import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PackageJson from '@npmcli/package-json';
import {
  filterPackages,
  fromRootOption,
  packageFilterOptions,
  parallelOptions,
  readFromRootOption,
  readPackageFilterOptions,
  readParallelOptions,
} from 'rman';

/** The per-package worker, run as its own process - see the file for why. */
const WORKER = fileURLToPath(new URL('./check-worker.js', import.meta.url));

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
 * `rman check` - dpdm's circular-dependency check, once per package, **and an import that does not
 * resolve fails it too**.
 *
 * Per package rather than once at the root because dpdm walks a single entry point: each package
 * has to be asked about its own. Standing inside a package checks only that one - and unlike
 * `format`/`lint`, which never iterate packages, this one therefore *does* take `--from-root` and
 * the package filter, because both mean something here.
 *
 * dpdm is run directly rather than through a `check` script, so nothing has to appear in `.rmanrc`
 * for this to work - the command owns its tool, the way `format` owns prettier.
 *
 * **Through dpdm's API, in a worker process per package** (`check-worker.js`), not dpdm's CLI. The
 * CLI answered with an exit code - and only because `--exit-code circular:1` asked it to; without
 * that a cycle exited 0 - and with `--no-warning` it also hid every import it could not resolve,
 * which hides every cycle running through one: measured, a package whose tsconfig was missing had
 * `./b.js` unresolved, a real `index.ts <-> b.ts` cycle went unseen, and dpdm congratulated it. The
 * worker hands back the cycles and the unresolved imports as data, and draws no spinner of its own.
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
    describe: 'Checks each package: package.json as npm will publish it, and circular dependencies with dpdm',
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
     * @param {import('rman').CommandContext} [context]
     */
    handler: async (args, context) => {
      /* Optional in rman's type, and always handed over by its CLI: only a caller registering
       * commands without a repository (a spec listing them) leaves it out, and that caller never
       * runs a handler. Said here rather than assumed, so the type narrows. */
      if (!context) throw new Error('"rman check" needs the CommandContext rman hands a command.');
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

      /** A package without the entry file has nothing for dpdm to walk, and still has a manifest to
       *  check - so it is scheduled, and the walk alone is skipped. */
      const hasEntry = (/** @type {import('rman').Package} */ pkg) => fs.existsSync(path.resolve(pkg.dirname, entry));
      const withoutEntry = packages.filter((pkg) => !hasEntry(pkg)).length;

      if (!packages.length) {
        logger.info(`Nothing to check - every package was filtered out.`);
        return;
      }
      /** An entry point that matches no package at all, asked for by name, is a mistake - a wrong
       *  `--entry` - and must not pass on the strength of the manifests alone. The default missing
       *  everywhere is a repository with no TypeScript sources, which is fine. */
      if (withoutEntry === packages.length && entry !== DEFAULT_ENTRY) {
        const message = `No package has "${entry}" - nothing to walk.`;
        console.error(message);
        throw loggedError(message);
      }

      /**
       * **rman schedules this, not a loop here** - so `--parallel`, `--bail` and the progress panel
       * come from the one implementation of them. What went with the loop: a hand-rolled tally
       * (whose `notRun` arithmetic reported packages a bail had skipped as successes until it was
       * fixed here separately), a `logger.info` per package, and the summary line - all of which the
       * panel's own recap already prints, per package and with the failing output replayed.
       */
      await context.forEachPackage(
        packages,
        async ({ pkg, runBin, logger: stepLogger }) => {
          const corrections = await manifestCorrections(pkg.dirname);
          for (const change of corrections) console.error(`package.json: ${change} - "npm pkg fix" corrects it`);
          const manifestProblem =
            corrections.length > 0 && plural(corrections.length, 'package.json correction', 'package.json corrections');

          if (!hasEntry(pkg)) {
            if (manifestProblem) throw loggedError(manifestProblem);
            stepLogger.info(`package.json as npm publishes it, no ${entry} to walk`);
            return;
          }

          /** The worker's stderr is the step's output - a missing dpdm says so there; its stdout is
           *  the one JSON line, read off the result rather than printed. */
          const { output } = await runBin('node', [WORKER, entry], {
            onLine: (line, stream) => {
              if (stream === 'stderr') console.error(line);
            },
          });
          const line = output.split('\n').find((l) => l.startsWith('{"files"'));
          if (!line) throw loggedError(`dpdm returned nothing for ${pkg.name}`);
          /** @type {{ files: number, cycles: string[][], unresolved: { file: string, request: string }[] }} */
          const result = JSON.parse(line);

          for (const cycle of result.cycles) console.error(`circular dependency: ${cycle.join(' -> ')}`);
          /** An import that does not resolve is an error of its own, not just a warning: dpdm cannot
           *  follow it, so any cycle running through it is invisible - see the command's doc. */
          for (const miss of result.unresolved) console.error(`unresolved import "${miss.request}" in ${miss.file}`);

          const problems = [
            manifestProblem,
            result.cycles.length && plural(result.cycles.length, 'circular dependency', 'circular dependencies'),
            result.unresolved.length && plural(result.unresolved.length, 'unresolved import', 'unresolved imports'),
          ].filter(Boolean);
          if (problems.length) throw loggedError(problems.join(', '));
          stepLogger.info(`${plural(result.files, 'file', 'files')}, no circular dependency`);
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

      if (withoutEntry) logger.info(`${withoutEntry} without ${entry}: package.json checked, no walk`);
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

/** `1 circular dependency`, `2 circular dependencies`. */
function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * What npm would correct in the package's `package.json` when publishing it - npm's own messages,
 * `'"repository.url" was normalized to ...'` - and nothing is written.
 */
/* **npm's own normalization, through the library npm publishes with** (`@npmcli/package-json`'s
 * `fix`, which only changes the file when `save` is called). Every one of these is printed by
 * `npm publish` as `npm warn publish errors corrected`, in CI, after the version is already tagged -
 * measured on this repository's 2.3.0 release, `repository.url` on every package. A list of our own
 * would be a second opinion about what npm accepts; this is npm's, and follows its new rules. */
async function manifestCorrections(dir) {
  /** @type {string[]} */
  const changes = [];
  await PackageJson.fix(dir, { changes });
  return changes;
}
