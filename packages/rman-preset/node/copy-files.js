import fs from 'fs';
import path from 'path';
import { globSync } from 'tinyglobby';

/**
 * Copies a list of files or directories into a target directory.
 *
 * Exported so a repository's own `.rmanrc` can use it without this preset's build hook - the same
 * list syntax, wherever you need it:
 *
 * ```js
 * import { copyFiles } from '@panates/rman-preset';
 *
 * copyFiles(['docs > doc/'], {
 *   into: path.join(pkg.dirname, 'build'),
 *   lookIn: [pkg.dirname, repository.dirname],
 * });
 * ```
 *
 * `into` is where things land. `lookIn` is where sources are resolved from, in order - the preset
 * passes the package and then the repository root, so one declaration covers a per-package
 * `README.md` and a shared `LICENSE`. It defaults to the current working directory.
 *
 * Each entry is a string or `{ from, to }`. The string form is a small DSL, and `>` is the only
 * thing it adds over a bare path:
 *
 * | entry                        | result                                    |
 * | ---------------------------- | ----------------------------------------- |
 * | `'README.md'`                | `build/README.md`                         |
 * | `'LICENSE > doc/LICENSE'`    | `build/doc/LICENSE`                       |
 * | `'README.md, LICENSE > doc/'`| `build/doc/README.md`, `build/doc/LICENSE`|
 * | `'*.md > doc/'`              | every `.md` into `build/doc/`             |
 * | `{ from: 'assets', to: 'assets' }` | the directory, recursively          |
 *
 * **A trailing `/` on the destination is what says "directory".** Without one the destination is
 * the file's own path, which only makes sense for a single source - several sources or a glob
 * without it is an error rather than five files overwriting each other at one path.
 *
 * **A glob flattens to basenames, and a collision throws.** `'src/**\/*.md > doc/'` putting
 * `a/x.md` and `b/x.md` at the same place is a mistake worth reporting, not a silent last-wins.
 * Preserving a tree is what the object form is for: `{ from: 'src/templates', to: 'templates' }`
 * copies the directory as it stands.
 *
 * **Trap: a glob has to be quoted in YAML.** `*` is the alias indicator, so `- *.md > doc/` fails
 * to load with `bad indentation of a mapping entry` - the same rule that makes `"[*]"` selectors
 * need quotes. `- '*.md > doc/'` is fine, and so is every form that does not start with `*`.
 *
 */
export function copyFiles(entries, { into, lookIn = [process.cwd()] }) {
  const lookupDirs = Array.isArray(lookIn) ? lookIn : [lookIn];
  const buildDir = into;
  for (const entry of entries) {
    if (!entry) continue;

    const { sources, dest, isDir } =
      typeof entry === 'string' ? parseCopyEntry(entry) : { sources: [entry.from], dest: entry.to, isDir: false };

    /** Resolved as `<base>/<matched path>`, so a glob is matched where the source was found. */
    const matches = [];
    for (const source of sources) {
      const base = lookupDirs.find((d) => fs.existsSync(path.resolve(d, source)));
      if (base) {
        matches.push({ base, rel: source });
        continue;
      }
      for (const dir of lookupDirs) {
        const hits = globSync(source, { cwd: dir, dot: false, onlyFiles: false });
        if (hits.length) {
          for (const rel of hits) matches.push({ base: dir, rel });
          break;
        }
      }
    }
    if (!matches.length) continue;

    if (!isDir && matches.length > 1) {
      throw new Error(
        `copyFiles entry ${JSON.stringify(entry)} matched ${matches.length} paths but its ` +
          `destination is a single file. End it with "/" to copy them into a directory.`,
      );
    }

    const taken = new Map();
    for (const { base, rel } of matches) {
      const target = isDir
        ? path.join(buildDir, dest, path.basename(rel))
        : path.resolve(buildDir, dest ?? path.basename(rel));
      const previous = taken.get(target);
      if (previous) {
        throw new Error(
          `copyFiles entry ${JSON.stringify(entry)} copies both "${previous}" and "${rel}" to ` +
            `"${path.relative(buildDir, target)}". Copy the directory instead, with ` +
            `{ from: ..., to: ... }.`,
        );
      }
      taken.set(target, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(path.resolve(base, rel), target, { recursive: true });
    }
  }
}

/** Splits `"a, b > dir/"` into its sources and destination. No `>` means the old shape: copy each
 *  source to its own basename at the build root. */
function parseCopyEntry(entry) {
  const at = entry.indexOf('>');
  if (at < 0) return { sources: splitSources(entry), dest: undefined, isDir: false };
  const dest = entry.slice(at + 1).trim();
  return { sources: splitSources(entry.slice(0, at)), dest: dest.replace(/\/+$/, ''), isDir: dest.endsWith('/') };
}

function splitSources(text) {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
