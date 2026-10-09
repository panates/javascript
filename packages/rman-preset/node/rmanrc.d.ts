/**
 * The `.rmanrc` keys this preset's commands contribute, on rman's `RmanConfig`. Reached through
 * `index.d.ts`, so a repository's typed config sees them as well as this package's own code.
 */
/* Written out rather than derived with `RmanConfig.CommandContribution<ReturnType<typeof cmd>>`,
 * which is how rman's own commands do it: that reads the config key off the `command` string's
 * literal type, and a JS factory returning `{ command: COMMAND }` widens it to `string` - rman then
 * answers with `__configKeyMustBeALiteral`. Each key here mirrors its command's `target: 'config'`
 * options, so a new one goes in both places. */
declare module 'rman' {
  namespace RmanConfig {
    interface CommandConfigs {
      /** `rman check` - threads for the dependency walk; `--parallel` overrides it per run. */
      check?: { concurrency?: number };
      /** `rman lint` - eslint's own `--concurrency`; `--parallel` overrides it per run. */
      lint?: { concurrency?: number };
    }
  }
}

export {};
