import { assertAllowedBranch, readBranchGuardOptions, readRunOptions, runOptions } from 'rman';

const COMMAND = 'compile';

/**
 * The options, as data - the same group `rman build` uses, taken from rman rather than restated.
 *
 * @satisfies {Record<string, import('rman').CommandOption>}
 */
const config = runOptions;

/**
 * **`rman compile` is `rman run compile` under a shorter name.**
 *
 * @param {import('rman').RmanApplication} app
 */
/* **An alias and nothing else, which is the whole design.** It owns no logic: it fans the `compile`
 * script out over the packages exactly as `run` does, so a package that declares none is skipped
 * and one that declares a `precompile`/`postcompile` gets them, with no second implementation of
 * any of it.
 *
 * **The flags come from rman's own `runOptions`, never a copy.** `--parallel`, `--bail`, `--topo`,
 * `--changed` and the package filters are what make `run` usable, and an alias that supports fewer
 * of them than the command it stands for is a trap: the flag works on `rman run compile`, does
 * nothing on `rman compile`, and nothing reports the difference. Restating them here would be two
 * lists free to drift - the failure this repository has met often enough to have a rule about it.
 *
 * **It owns no config key either.** `compile`'s settings are `run.compile`, which belongs to `run` -
 * the same reason rman's own `build` declares `configKeys: ['run.build']` and contributes nothing.
 *
 * **Why the preset rather than rman itself.** `build` and `test` are core because every ecosystem
 * has them; `compile` is this organization's step between a type-check and a bundle, so it belongs
 * with the rest of the Node toolchain the preset contributes. */
export default (app) => {
  const repository = app.repository;
  return {
    command: COMMAND,
    platform: 'node',
    describe: 'Alias for "run compile"',
    configKeys: ['run.compile'],
    config,
    examples: [
      { command: '$0 compile' },
      { command: '$0 compile --scope @scope/pkg', description: '# One package' },
      { command: '$0 compile --changed', description: '# Only what was touched' },
    ],
    /** @param {import('rman').ArgsOf<typeof config, typeof COMMAND>} args */
    handler: async (args) => {
      await assertAllowedBranch(repository, readBranchGuardOptions(args));
      await app.getService('run').runScript('compile', { ...readRunOptions(args), commandName: 'compile' });
    },
  };
};
