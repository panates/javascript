/**
 * The preset itself: the settings that hold whatever technology a repository is, with the Node
 * ones merged underneath through `extends`.
 *
 * @type {import('rman').RmanNodeConfig}
 */
/* **`extends`, not a spread and not a deep merge from a library.** Composing the two halves in
 * JavaScript gets rman's own layering wrong in two ways, both measured:
 *
 * - A spread is shallow, so two halves both declaring `changelog` keep only the later one's, with
 *   the rest of that key silently dropped.
 * - A general-purpose deep merge fixes that and breaks something else: `@jsopen/objects`'
 *   `merge({deep: true})` turns `commands: ['a','b']` merged with `['c']` into `['c']`, while rman
 *   *appends* those - `commands`, `plugins`, `platforms` and `publishTargets` are its
 *   `ALWAYS_APPEND` keys, precisely because naming a command of your own never means "and drop the
 *   ones my base brought". The day either half declares one the other already has, a generic merge
 *   loses it.
 *
 * `extends` hands the whole question back to rman, which is the only thing that knows those rules.
 * It also keeps each key's origin pointing at the file that actually holds it, so a failing
 * expression names `node/config.js` rather than this file. (`rman` exports `mergeConfig` for the
 * case where one module must hand back a single finished object; this is not that case.)
 *
 * **The `@type` annotation is load-bearing.** Without it `checkJs` reports TS2883 twice - the
 * inferred type of `default` cannot be named without `ChangelogExtraKeys` and `CleanExtraKeys`,
 * internals rman does not export from its root. Passing `node/config.js`'s object straight through
 * used to avoid that by inheriting its declared type; an object literal here has to say the type
 * out loud. */
export default {
  extends: ['./node/config.js'],

  /* **Platform-neutral, so they sit here rather than in `node/config.js`.** None of the three says
   * anything about npm: how a repository numbers its packages, and whether a release writes its
   * changelog, are the same questions for any technology rman grows. */

  /** A version line per package, rather than one number for the whole repository.
   *
   * Unmarked, so a repository wanting the opposite writes a plain `group: true` and wins - an
   * unmarked key in the consumer beats an unmarked key in the base. Inside a `"[selector]"` block
   * it would beat the consumer's unmarked key instead, which is the trap that cost `panates/sqb`
   * an afternoon. */
  group: false,

  changelog: {
    unreleased: false,
  },

  '[/]': {
    version: {
      /**
       * Each bumped package's `CHANGELOG.md` is written by `version`, folded into the same commit
       * as the bump.
       */
      /* **`version` is the only stage that can do this, and the other two both fail.**
       *
       * *Before* it: the entry's heading is the version being cut, which does not exist until the
       * plan is computed - so a separate `changelog --write` step would have to read it back from
       * `version --json` and pass `--release-version`. And the file it writes leaves the tree
       * dirty, which `version` then refuses, so it needs a commit of its own and the tag lands on
       * the one after it.
       *
       * *After* it: the new tag is already there, auto-detection finds it and reports nothing
       * changed, and the entry comes out empty. (`github-release` escapes that by passing the
       * boundary explicitly; a plain `changelog --write` step cannot.)
       *
       * `version --changelog` hands `ChangelogService` the pre-bump tag explicitly, so detection
       * never runs, and the manifest bump, the changelog entry and the version stamps land in one
       * commit under one tag - the tagged commit carries its own release notes.
       *
       * **Declared under `"[/]"`, and the level is load-bearing.** `version.command.ts` reads
       * `repository.config?.version?.changelog` - the *root's* config, once per run, not per
       * package. Under `"[*]"` this would work in a single-package repository (where a glob
       * reaches the root since rman 2.1.0) and silently do nothing in a monorepo, which is the
       * same wrong-level trap `run.<script>`'s `concurrency` and `topo` keys already document.
       */
      changelog: true,
    },
  },
};

/** Exported as a utility so a repository's own `.rmanrc` can copy files the same way this
 *  config's build hook does. */
export { copyFiles } from './node/copy-files.js';

/** Likewise for the version constant in a build directory - a repository stamping something this
 *  config's `vars.stampFiles` does not cover can call it directly from its own hook. */
export { stampFiles } from './node/stamp-files.js';
