import fs from 'node:fs';
import path from 'node:path';
import { stampVersionConstant } from 'rman';

/**
 * Rewrites the version constant in files of a **build directory**, to the version the package
 * currently declares.
 *
 * @param {(string | { file: string, constant?: string })[]} entries paths relative to `into`; an
 *   object may name the identifier when it is not spelled `version`
 * @param {{ into: string, version: string }} options `into` is the build directory
 * @returns {string[]} the files it actually rewrote, absolute
 */
/* **This does not replace `rman version`'s stamping; it runs after it and usually changes nothing.**
 * `version` rewrites the *source* and commits it, so the tagged commit records what shipped and
 * anything running from source reports it - and `@v3`'s release is Version -> Build -> Publish, so
 * `tsc` compiles an already-stamped source and the published artifact is correct without this.
 *
 * What this is for is the build directory **between** releases, which is where a person actually
 * debugs. Two arrangements reach it:
 *
 *   - A repository that keeps a **placeholder** in the source and lets the build inject the real
 *     version. rman's own does exactly that - `src/constants.ts` reads `export const version = '1'`,
 *     its `.rmanrc.yml` declares no `version.stamp`, and a bespoke `support/postbuild.cjs` bakes
 *     `package.json`'s version into `build/constants.js`. This is that script, generalized, so no
 *     repository needs one of its own.
 *   - A repository whose source *is* stamped: then the compiled output already holds the right
 *     value and every call here is a no-op, which is the correct outcome rather than a wasted one.
 *
 * **Silent where there is nothing to do** - a missing file, or a file holding no version constant,
 * is skipped without a word. That is the opposite of `version.stamp`, which *errors* on a file it
 * cannot rewrite, and the asymmetry is the point: `version.stamp` names a source file a repository
 * expects to be stamped, where silence would ship a stale constant on every release from then on.
 * Here the source has already had its say, this is derived output, and a build that fails because a
 * package has no version constant would be refusing to build over a convention it never adopted.
 *
 * **`package.json`'s version is what gets written**, read off `pkg` rather than from any constant -
 * the manifest is the one place a package's version is authoritative, so a build can never disagree
 * with the thing about to be published. */
export function stampFiles(entries, { into, version }) {
  const stamped = [];
  for (const entry of entries) {
    const { file, constant } = typeof entry === 'string' ? { file: entry, constant: undefined } : entry;
    if (!file) continue;
    const target = path.resolve(into, file);
    if (!fs.existsSync(target)) continue;
    const before = fs.readFileSync(target, 'utf-8');
    const next = stampVersionConstant(before, version, constant);
    /** `undefined` is "no version constant in here", which is not this hook's business to report.
     *  `next === before` is "already at that version", so there is nothing to write either. */
    if (next === undefined || next === before) continue;
    fs.writeFileSync(target, next, 'utf-8');
    stamped.push(target);
  }
  return stamped;
}
