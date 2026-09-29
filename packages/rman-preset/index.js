import nodePreset from './node/config.js';

/* **Exported as-is, never as `{ ...nodePreset }`.** Spreading makes TypeScript infer a fresh object
 * type for this module's default export, and naming that type needs `ChangelogExtraKeys` and
 * `CleanExtraKeys` - internals rman does not export from its root - so `checkJs` reports TS2883,
 * "the inferred type of 'default' cannot be named without a reference to ...". Passing the object
 * through keeps the named `RmanNodeConfig` that `node/config.js` already declares.
 *
 * `export { default } from ...` would say the same thing in one line and eslint's
 * `no-restricted-exports` refuses it. */
export default nodePreset;

/** Exported as a utility so a repository's own `.rmanrc` can copy files the same way this
 *  config's build hook does. */
export { copyFiles } from './node/copy-files.js';
