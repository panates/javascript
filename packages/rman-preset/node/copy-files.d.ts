/** An entry that names its source and destination explicitly, for a path the string form cannot
 *  express - one containing `,` or `>`, or a directory copied under a different name. */
export interface CopyFilesEntry {
  /** Source path, resolved against each of `lookIn` in order. A directory is copied recursively. */
  from: string;
  /** Destination, relative to `into`. Defaults to `from`'s basename. */
  to?: string;
}

export interface CopyFilesOptions {
  /** Directory everything lands in. */
  into: string;
  /** Directories a source is resolved against, in order. Defaults to `[process.cwd()]`. */
  lookIn?: string | readonly string[];
}

/**
 * Copies files or directories into `options.into`.
 *
 * A string entry is `<sources> [> <destination>]`, sources comma-separated and each optionally a
 * glob. A trailing `/` on the destination makes it a directory; without one the destination is the
 * file's own path, so it can rename - and several sources or a glob without it throws.
 *
 * @throws if an entry matches several paths but names a single-file destination, or if two matches
 *   would land at the same path.
 */
export function copyFiles(entries: readonly (string | CopyFilesEntry)[], options: CopyFilesOptions): void;
