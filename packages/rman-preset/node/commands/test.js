import path from 'node:path';
import { runBin } from 'rman';

const COMMAND = 'test [args..]';

/**
 * The options, as data. `@satisfies` rather than `@type`, for the reason rman's own option groups
 * give: an annotation widens `type: 'boolean'` back to `string`, and `ArgsOf` collapses with it.
 *
 * @satisfies {Record<string, import('rman').CommandOption>}
 */
const config = {
  script: {
    target: 'cli',
    alias: 's',
    describe: 'The npm script to run. Default "test"; "citest" is the usual name for the one with coverage',
    type: 'string',
    default: 'test',
  },
};

/** @satisfies {Record<string, import('rman').PositionalOption>} */
const positionals = {
  args: {
    describe: 'Arguments passed on to the script, after "--" (e.g. rman test -- --grep auth)',
    type: 'string',
  },
};

/**
 * **`rman test` runs the `test` script of the package you are standing in - not every package.**
 *
 * @param {import('rman').RmanApplication} app
 */
/* **Why this exists at all.** rman's built-in `test` is an alias for `run test`, which fans the
 * script out over the repository's packages. Measured across seven repositories of this
 * organization: not one has a package with its own `test` script, because testing here is a single
 * mocha run at the repository root - exactly as linting is a single eslint run there. So
 * `rman test` answered `No package defines a "test" script.` and everyone typed `npm test`
 * instead, which left one verb outside the set (`rman check`, `rman lint`, `rman format`,
 * `rman build`, and then `npm test`).
 *
 * rman 2.3 made `build` and `test` shadowable for this: they are the two built-ins that carry no
 * logic of their own, so the name belongs to whoever has the better answer. `rman run test` still
 * fans out, for a repository whose tests really are per package.
 *
 * **The current directory, deliberately, and this is the one command here that works that way.**
 * `check` and `lint` are repository-wide because a cycle and a lint rule are; a test run is the
 * thing you narrow while working. At the root that is the root's own script - the whole suite - and
 * inside a package it is that package's, if it has one. `Repository.currentPackage` is `undefined`
 * at the root, which is what makes the fallback the root package rather than a special case.
 *
 * **Through the package manager rather than by reading the script and running it.** The script is
 * whatever the repository wrote - `mocha`, `c8 mocha`, `tsc -b ... && mocha` - so it needs a shell,
 * and `npm run` additionally honours `pretest`/`posttest` and puts `node_modules/.bin` on PATH.
 * Reading the string and exec'ing it would be a second, worse implementation of `npm run`.
 *
 * **A package with no such script is an error, not a quiet success.** That is the rule rman applies
 * to an empty `run`, and for the same reason: a test command that passes having tested nothing is
 * the outcome worth ruling out. */
export default (app) => {
  const repository = app.repository;
  return {
    command: COMMAND,
    platform: 'node',
    describe: "Runs the test script of the package you are in (the repository's own at the root)",
    config,
    positionals,
    examples: [
      { command: '$0 test' },
      { command: '$0 test --script citest', description: '# The one with coverage' },
      { command: '$0 test -- --grep auth', description: '# Pass arguments to the runner' },
      { command: '$0 run test', description: '# The old meaning: every package that defines one' },
    ],
    /** @param {import('rman').ArgsOf<typeof config, typeof COMMAND>} args */
    handler: async (args) => {
      /** `undefined` at the root, which is where the whole suite lives. */
      const pkg = repository.currentPackage ?? repository.rootPackage;
      const script = args.script || 'test';

      const scripts = pkg.manifest?.raw?.scripts ?? {};
      if (!scripts[script]) {
        throw new Error(
          `"${pkg.name}" has no "${script}" script` +
            `${pkg.isRoot ? '' : ` (${path.relative(repository.dirname, pkg.dirname)})`}. ` +
            `Add one, run it from a directory that has it, or use \`rman run ${script}\` to fan it ` +
            `out over the packages that do.`,
        );
      }

      const passThrough = args.args?.length ? ['--', ...args.args] : [];
      await runBin('npm', ['run', script, ...passThrough], {
        cwd: pkg.dirname,
        app: repository.app,
        logLevel: args.logLevel,
      });
    },
  };
};
