import { runBin } from 'rman';

const COMMAND = 'format [paths..]';

/**
 * The options, as data. `@satisfies` rather than `@type`, for the reason rman's own option groups
 * give: an annotation widens `type: 'boolean'` back to `string`, and `ArgsOf` collapses with it.
 *
 * @satisfies {Record<string, import('rman').CommandOption>}
 */
const config = {
  check: {
    target: 'cli',
    describe: "Report files that aren't formatted and exit non-zero, writing nothing. For CI.",
    type: 'boolean',
  },
};

/**
 * The positionals, hoisted for the same reason the options are and with the same `@satisfies`.
 *
 * Left inline in the returned object it is checked structurally, and `type: 'string'` widens to
 * `string` - which `PositionalOptions` rejects. The error then lands on the whole `commands` key
 * of the config that declares this command, several "is not assignable" levels away from the word
 * that caused it.
 *
 * @satisfies {Record<string, import('rman').PositionalOption>}
 */
const positionals = {
  paths: {
    describe: 'What to format, relative to the repository root. Defaults to the whole repository.',
    type: 'string',
    array: true,
  },
};

/**
 * `rman format` - runs prettier **once at the repository root**.
 *
 * Why a command and not a `run.format` script: a formatter decides its own scope. `prettier .` with
 * the repository's `.prettierignore` already covers every file, so running it per package repeats
 * that work N times and still misses everything outside a package - the root's own configs,
 * `support/`, `.github/`. One command at one place also makes `--check` possible, which is the form
 * CI actually wants.
 *
 * It follows that this command takes **no package filter and no `--from-root`**: it never iterates
 * packages, so `--scope` would be a flag that does nothing, and a no-op flag reads as a promise.
 *
 * **Declared, not built.** A factory of `app` returning the metadata, which is the form
 * `ctx.addCommand` prefers and the same one rman's own commands use - options are data rather than
 * a hand-written `builder`, so the flag list cannot drift from what the handler reads. A bare
 * arrow function rather than `declareCommand`, which is an identity helper: `addCommand` decides by
 * `typeof command === 'function'`, so nothing has to be imported for the shape alone.
 *
 * `runBin` *is* imported, and needs its settings passed rather than inherited: the `CommandContext`
 * one carried them, and a declarative command has no context. `cwd` is the repository root (where
 * `prettier .` is meant to run), `app` is what puts `node_modules/.bin` on PATH - so Windows gets
 * the `.cmd` - and `logLevel` is what keeps `--log-level` honoured. A non-zero exit rejects, which
 * is what makes rman itself exit non-zero.
 *
 * @param {import('rman').RmanApplication} app
 */
export default (app) => {
  const repository = app.repository;
  return {
    command: COMMAND,
    describe: 'Formats the whole repository with prettier (--check to verify without writing)',
    config,
    positionals,
    examples: [
      { command: '$0 format' },
      { command: '$0 format --check', description: '# Fails if anything is unformatted' },
      { command: '$0 format packages/core', description: '# Just one directory' },
    ],
    /** @param {import('rman').ArgsOf<typeof config, typeof COMMAND>} args */
    handler: async (args) => {
      const paths = args.paths?.length ? args.paths : ['.'];
      /** `--log-level=warn` only when writing: on success prettier then says nothing, which is what
       *  you want from a formatter. `--check` has to keep its default level - the list of
       *  unformatted files *is* its output. */
      const flags = args.check ? ['--check'] : ['--write', '--log-level=warn'];
      await runBin('prettier', [...paths, ...flags], {
        cwd: repository.dirname,
        app: repository.app,
        logLevel: args.logLevel,
      });
    },
  };
};
