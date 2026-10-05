#!/usr/bin/env node
/**
 * `rman check`'s per-package worker: walks one package's sources with dpdm's API and prints what it
 * found as one line of JSON - `{ files, cycles, unresolved }` - to stdout. Run in the package's own
 * directory, with the entry point as its only argument.
 *
 * Exits 0 whatever it found; the verdict is the JSON, and `check` decides. A non-zero exit means the
 * worker itself failed - dpdm not installed, an entry dpdm could not read.
 */
/* **A process per package, not the API in rman's own.** dpdm's work is TypeScript parsing, which is
 * CPU-bound: measured on `panates/opra` (19 packages, 18 cores), the API run in one process took
 * 3.6-4.0s against 2.0-2.3s for one dpdm process per package, because one process is one thread.
 * This keeps the processes and swaps what runs in them.
 *
 * **dpdm resolved from the package's directory**, as `runBin('dpdm')` found the binary through
 * `node_modules/.bin` from there - the repository's own copy, not one beside this preset.
 *
 * **The options are the CLI's `-T --skip-dynamic-imports circular`**: `transform` drops type-only
 * imports, and dynamic imports are parsed but left out of the cycle search, since a lazy `import()`
 * is how a cycle is broken on purpose. */
import { createRequire } from 'node:module';
import path from 'node:path';

const entry = process.argv[2];
const cwd = process.cwd();

let dpdm;
try {
  dpdm = createRequire(path.join(cwd, 'package.json'))('dpdm');
} catch {
  console.error('"dpdm" was not found - is it installed in this repository?');
  process.exit(2);
}

const tree = await dpdm.parseDependencyTree(entry, {
  ...dpdm.defaultOptions,
  cwd,
  context: cwd,
  transform: true,
  skipDynamicImports: false,
});

if (dpdm.isEmpty(tree)) {
  console.error(`dpdm matched no file for "${entry}".`);
  process.exit(2);
}

/** An import dpdm could not resolve to a file (`id === null`), less two kinds that are not files. */
/* - **A runtime's own module** (`bun:sqlite`, `deno:...`): a protocol-prefixed specifier names
 *   something built into the runtime, as `node:fs` does - dpdm knows `node:` and nothing else.
 *   Measured across 70 packages in 19 repositories: `bun:sqlite` in two of sqb's was the only
 *   unresolved import there was, and failing on it would have failed a correct package.
 * - **A dynamic import**, left out the way the cycle search leaves it out: loading something that may
 *   not be installed is what a lazy `import()` is for. No case of it in the same 70 packages - this
 *   is the rule, not a measured fix. */
const RUNTIME_MODULE = /^[a-z][a-z0-9+.-]+:/i;
const unresolved = [];
for (const deps of Object.values(tree)) {
  for (const dep of deps ?? []) {
    if (dep.id === null && dep.kind !== 'DynamicImport' && !RUNTIME_MODULE.test(dep.request)) {
      unresolved.push({ file: path.relative(cwd, dep.issuer), request: dep.request, kind: dep.kind });
    }
  }
}

/** Paths relative to the package, as dpdm's own output prints them. */
const cycles = dpdm
  .parseCircular(tree, true)
  .map((cycle) => cycle.map((id) => path.relative(cwd, path.resolve(cwd, id))));

process.stdout.write(JSON.stringify({ files: Object.keys(tree).length, cycles, unresolved }) + '\n');
