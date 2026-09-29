/** An entry that names the identifier holding the version, for a file where it is not spelled
 *  `version` - `VERSION`, `Version`, `appVersion`. */
export interface StampFilesEntry {
  /** Path relative to `into`. */
  file: string;
  /** The identifier to rewrite. Defaults to `version`. */
  constant?: string;
}

export interface StampFilesOptions {
  /** The build directory the paths are relative to. */
  into: string;
  /** The version to write - `package.json`'s, which is where a package's version is authoritative. */
  version: string;
}

/**
 * Rewrites the version constant in files of a build directory.
 *
 * Silent where there is nothing to do: a missing file, or one holding no version constant, is
 * skipped. That is deliberately unlike `.rmanrc "version.stamp"`, which errors on a file it cannot
 * rewrite - there a repository named a *source* file it expects to be stamped, and silence would
 * ship a stale constant on every release; here the output is derived and a build must not fail over
 * a convention the package never adopted.
 *
 * @returns the files it rewrote, absolute.
 */
export function stampFiles(entries: readonly (string | StampFilesEntry)[], options: StampFilesOptions): string[];
