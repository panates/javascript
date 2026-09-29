import { runBin } from 'rman';

const COMMAND = 'lint [paths..]';

/** @satisfies {Record<string, import('rman').CommandOption>} */
const config = {
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
    describe: 'What to lint, relative to the repository root. Defaults to the whole repository.',
    type: 'string',
    array: true,
  },
};

/**
 * `rman lint` - runs eslint **once at the repository root**.
 *
 * Same reasoning as `rman format`: a linter decides its own scope. `eslint .` against the flat
 * config at the root already covers every package plus everything that belongs to no package, so a
 * per-package run reloads the config and rebuilds the TypeScript program once per package and still
 * misses the root's own files. It therefore takes no package filter and no `--from-root` - neither
 * would do anything, and a no-op flag reads as a promise.
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
    describe: 'Lints the whole repository with eslint (--fix to apply the fixable ones)',
    config,
    positionals,
    examples: [
      { command: '$0 lint' },
      { command: '$0 lint --fix', description: '# Fix what can be fixed' },
      { command: '$0 lint --max-warnings=-1', description: '# Report warnings without failing' },
      { command: '$0 lint packages/core', description: '# Just one directory' },
    ],
    /** @param {import('rman').ArgsOf<typeof config, typeof COMMAND>} args */
    handler: async (args) => {
      const paths = args.paths?.length ? args.paths : ['.'];
      const flags = [`--max-warnings=${args.maxWarnings}`, ...(args.fix ? ['--fix'] : [])];
      await runBin('eslint', [...paths, ...flags], {
        cwd: repository.dirname,
        app: repository.app,
        logLevel: args.logLevel,
      });
    },
  };
};
