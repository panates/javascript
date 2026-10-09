import path from 'node:path';
import { fromRootOption, parallelOptions, runBin } from 'rman';

const COMMAND = 'lint [paths..]';

/** @satisfies {Record<string, import('rman').CommandOption>} */
const config = {
  /**
   * **One flag out of rman's shared group, not the whole group.** `parallel` is the only one of the
   * three that means anything to a single eslint process - `bail` and `progress` describe a run
   * *over packages*, and a flag that does nothing reads as a promise. Taken from `parallelOptions`
   * rather than restated so `--parallel` is spelled and coerced here exactly as everywhere else:
   * it accepts a boolean *or* a number, and that is `coerce`'s doing.
   */
  parallel: parallelOptions.parallel,
  ...fromRootOption('Lint'),
  concurrency: {
    target: 'config',
    describe:
      "Linting threads, for a repository that benefits - eslint's own --concurrency, needs eslint " +
      '10+. Unset, eslint decides (single-threaded). --parallel overrides it per run.',
    type: 'number',
  },
  fix: {
    target: 'cli',
    alias: 'f',
    describe: 'Apply every fix eslint can make itself, and report only what is left',
    type: 'boolean',
  },
  maxWarnings: {
    target: 'cli',
    cliName: 'max-warnings',
    alias: 'w',
    describe:
      'Warnings tolerated before the command fails. Default 0 - a warning nobody ever has to ' +
      'act on is a warning that accumulates. -1 reports them without ever failing.',
    type: 'number',
    default: 0,
  },
};

/** The positionals, hoisted and `@satisfies`-checked - see [`format.js`](./format.js) for why
 *  leaving them inline in the returned object does not type-check.
 *
 *  @satisfies {Record<string, import('rman').PositionalOption>} */
const positionals = {
  paths: {
    describe:
      'What to lint, relative to the repository root. Defaults to the package the command is run ' +
      'inside, or the whole repository from anywhere else.',
    type: 'string',
    array: true,
  },
};

/**
 * `rman lint` - runs eslint **once, from the repository root**: over the whole repository, or over
 * the package the command is run inside (`--from-root` for the whole repository anyway) - the rule
 * rman's own `run`, `build` and `clean` follow.
 *
 * Same reasoning as `rman format`: a linter decides its own scope. `eslint .` against the flat
 * config at the root already covers every package plus everything that belongs to no package, so a
 * per-package sweep reloads the config and rebuilds the TypeScript program once per package and
 * still misses the root's own files. It therefore takes no package filter. Narrowing to the current
 * package is different: one eslint process, still run from the root so the flat config and its
 * plugins resolve, handed one directory instead of `.`.
 *
 * `--fix` replaces what used to be a separate `lint:fix` script - one switch on one command rather
 * than two scripts that must be kept saying the same thing.
 *
 * **Declared, not built** - see [`format.js`](./format.js) for the shape and for why `runBin` is
 * handed `cwd`/`app`/`logLevel` explicitly instead of coming off a `CommandContext`.
 *
 * `cliName: 'max-warnings'` because the flag is hyphenated while the key the handler reads is
 * `maxWarnings`; yargs expands the one into the other, and saying so here is what keeps `--help`
 * showing the hyphenated spelling.
 *
 * @param {import('rman').RmanApplication} app
 */
export default (app) => {
  const repository = app.repository;
  return {
    command: COMMAND,
    platform: 'node',
    describe: 'Lints the repository with eslint, or the package it is run inside (--fix to apply the fixable ones)',
    config,
    positionals,
    examples: [
      { command: '$0 lint' },
      { command: '$0 lint --fix', description: '# Fix what can be fixed' },
      { command: '$0 lint --max-warnings=-1', description: '# Report warnings without failing' },
      { command: '$0 lint packages/core', description: '# Just one directory' },
      { command: '$0 lint --from-root', description: '# The whole repository, from inside a package' },
      { command: '$0 lint --parallel false', description: '# One thread, for a loaded machine' },
    ],
    /** @param {import('rman').ArgsOf<typeof config, typeof COMMAND>} args */
    handler: async (args) => {
      const scope = args.fromRoot ? undefined : repository.currentPackage;
      const paths = args.paths?.length ? args.paths : [scope ? path.relative(repository.dirname, scope.dirname) : '.'];
      /** Nothing is passed unless asked for - see `eslintConcurrency`, where one repository in
       *  three is broken by the flag at any value. */
      const concurrency = eslintConcurrency(args.parallel ?? repository.rootPackage.config.lint?.concurrency);
      const flags = [
        `--max-warnings=${args.maxWarnings}`,
        ...(args.fix ? ['--fix'] : []),
        ...(concurrency === undefined ? [] : [`--concurrency=${concurrency}`]),
      ];
      await runBin('eslint', [...paths, ...flags], {
        cwd: repository.dirname,
        app: repository.app,
        logLevel: args.logLevel,
      });
    },
  };
};

/**
 * rman's `--parallel` as eslint's `--concurrency`, or `undefined` to pass nothing at all.
 *
 * **Opt-in, and that is a measurement rather than caution.** Turning it on by default was the plan
 * until it was run against this organization's repositories: `panates/opra` **fails outright** -
 * `EslintPluginImportResolveError: node with invalid interface loaded as resolver`, every
 * `--concurrency` value including `off` - `panates/sqb` is faster (2.65s to 1.71s) but is told by
 * eslint itself `ESLintPoorConcurrencyWarning: You may disable concurrency or use a numeric
 * concurrency setting to improve performance`, and `panates-javascript` is 0.50s either way. One
 * repository in three broken is not a default; a repository that gains sets `lint.concurrency` or
 * passes `--parallel`.
 *
 * **One eslint process with threads, never one process per package** - the other thing this is not.
 * Sweeping packages with `forEachPackage` was measured on `panates/opra` at 3.75s wall against
 * 4.8s, for **31.3s of CPU against 8.0s**, because each of twenty processes reloads the flat config
 * and rebuilds its own TypeScript program. And it is wrong as well as wasteful: a root `eslint .`
 * covers 726 files there, five of which belong to no package at all (`eslint.config.mjs`,
 * `support/*`, `.mocharc.cjs`) and would simply stop being linted.
 *
 * The mapping is rman's flag read the way it reads everywhere else: `false` is one thread, a number
 * is that many, `true` is one per core.
 */
function eslintConcurrency(parallel) {
  if (parallel === undefined) return undefined;
  if (parallel === false) return 'off';
  if (typeof parallel === 'number') return String(parallel);
  return 'auto';
}
