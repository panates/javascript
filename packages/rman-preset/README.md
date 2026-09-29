# @panates/rman-preset

Panates' [rman](https://github.com/panates/rman) configuration for a TypeScript monorepo.

> **Renamed from `@panates/rman-node`.** The old name shipped no 1.0, so there is nothing to migrate
> beyond the name itself: change your `extends` line and the dependency. The old name described the
> technology rather than what the package is - a preset - and read as a sibling of rman's own
> `rman-node` plugin, which no longer exists as a separate package.

## Install

```bash
npm i -D @panates/rman-preset
```

```yaml
# .rmanrc.yml, at the repository root
extends: '@panates/rman-preset'
```

That is the whole configuration for a repository that follows the layout below. **Requires rman
2.0 or newer** - the selector semantics this config is written against (`"[/]"` for the root,
`"[*]"` for the packages below) and the `publish.npm.*` block both date from it.

No `$schema` line: rman shipped a JSON Schema through 1.0.x and it is gone, because a schema cannot
describe keys a _plugin_ contributes. Autocomplete comes from the `RmanNodeConfig` type instead,
which reaches the JS forms of the config (`.rmanrc.mjs`/`.cjs`/`.js`) and not YAML or JSON.

`rman check`, `rman format` and `rman lint` come with it, under this config's own `commands` key -
which is how any package adds commands to rman 2.0. **No `.rman/` directory of your own is
needed.**

That changed in 2.0 of this package. Before it, rman looked for a repository's own commands in
`.rman/` and nowhere else, so each had to be installed by hand:

```js
// .rman/check.mjs - delete this. The old package name is deliberate: it is what the
// file you are looking for actually says, since it predates the rename.
export { default } from '@panates/rman-node/commands/check';
```

**Delete them when you upgrade.** They do not merely become redundant: a command is declared as a
function now rather than as an object, and rman's `.rman/` loader only accepts the object - so the
file is skipped with a warning on _every_ rman invocation, and one that points at the wrong thing:

```
Skipped ".rman/check.mjs": no default export - end the module with `export default defineCommand({ ... })`
```

The command itself keeps working throughout, because this config supplies it. Only the stale file
needs to go.

If you want to _replace_ one of these with your own, that still works the way it always did - write
a real `.rman/<name>.mjs` command and it overrides this config's. rman registers a repository's own
commands last and yargs takes the last, so yours wins; `rman --help` then lists the name twice, once
with each description, because nothing de-duplicates two non-built-in commands by name. That
precedence is rman's intended escape hatch.

Your `.rman/` directory keeps working alongside these, and that is deliberate rather than
automatic: rman's `commands` key _appends_ across configs but a **glob** entry replaces the
`.rman/*.{js,mjs,cjs}` default, so a shared config shipping its commands as `'./commands/*.js'`
would silently take that directory away from every repository inheriting it. This one lists its
commands individually for exactly that reason.

## What it expects of a repository

|                  |                                                                                 |
| ---------------- | ------------------------------------------------------------------------------- |
| Packages         | `packages/*`, each with `src/` and a `tsconfig-build.json` emitting to `build/` |
| Version constant | `src/constants.ts` exporting `version` - optional per package                   |
| Tests            | mocha at the repository root, not per package                                   |
| Licence          | `LICENSE` at the repository root                                                |

## What it configures

- **A version line per package** (`group: false`), so a package releases only when its own
  commits warrant it. Set `group: true` in your own config to put the repository back on one
  shared number.
- **Publishing from `build/`** (`publish.npm.directory`). rman writes the manifest there itself at
  publish time, so nothing in the repository generates a second `package.json`. The block is named
  after the publish target it belongs to, as `publish.docker.*` is.
- **`rman version` stamps `src/constants.ts`**, in the same commit as the bump. The version lives in
  the _source_, so tests, `ts-node` and git all report what actually shipped - a build-time rewrite
  leaves the checked-in file claiming a placeholder forever.
- **`rman build`** runs `check` → `lint` → `clean`, then `tsc -b tsconfig-build.json`, then copies
  `README.md` and the repository's `LICENSE` into `build/`.
- **`check`, `lint`, `lint:fix`** as repository-wide scripts, so no package declares any of its own.
- **`clean`** removes `build`, `*.tsbuildinfo` and that package's own coverage directory. The
  incremental cache goes with the output deliberately: left behind, `tsc -b` decides everything is
  up to date and emits nothing.

## Commands

`rman check` runs dpdm's circular-dependency check **per package** - dpdm walks one entry point, so
each package has to be asked about its own. Standing inside a package checks only that one, and
nothing has to appear in `.rmanrc`: the command owns dpdm and its flags.

```bash
rman check                  # every package
rman check --changed        # only what you have touched
rman check --no-bail        # report every package, not just the first bad one
rman check -e ./src/main.ts # a package that enters somewhere else
```

The flag that matters is `--exit-code circular:1`, which is on by default: without it dpdm _reports_
a cycle and still exits 0, so a CI step would pass on a repository that has one.

Packages are checked in sequence, without `run`'s concurrency or progress panel - dpdm is fast and
the packages are independent. A package with no entry file is skipped and counted; every package
lacking one is an error rather than a pass, since that means a wrong `--entry`.

`format` and `lint` are the opposite case: they run **once, at the repository root**, and take paths
to narrow them:

```bash
rman format                    # prettier --write
rman format --check            # report what isn't formatted, exit non-zero, write nothing
rman format packages/core      # just one directory

rman lint                      # eslint --max-warnings=0
rman lint --fix                # and apply what eslint can fix itself
rman lint --max-warnings=5     # tolerate five (-1 never fails on warnings)
rman lint packages/core
```

Commands rather than `run.format`/`run.lint` scripts, because **both tools already decide their own
scope** from the root config. A per-package run passes `.` in each package's own directory, so it
silently never looks at any file belonging to no package - the root's own configs, `support/`,
`.github/`, the workflows. Measured on a two-package repository with one bad root-level file:
per-package linting reported success, root-level linting caught it.

Running each in one place is also what makes a switch enough where there used to be a second script
(`lint:fix`) or none at all (`--check`, which CI wants).

### Where lint runs during a build

`rman build` runs `rman lint` from each package's own `before` hook. Since the command always works
at the repository root, that is one **whole-repository** lint per package - two packages, two full
lints (measured).

To pay for it once instead, move it to the root's own bookend, which runs once before any package
builds and which every package waits on:

```yaml
extends: '@panates/rman-preset'
run:
  build:
    before: 'rman lint' # once, at the root, as a barrier
'[*]':
  run:
    build:
      before: ['rman run check', 'rman clean'] # without the lint step
```

A failing lint then leaves `0 succeeded, 1 failed, 2 skipped` and nothing compiled (measured), which
is the same guarantee for a fraction of the work.

## Overriding and adding

A key you declare replaces this config's:

```yaml
extends: '@panates/rman-preset'
'[*]':
  run:
    build:
      exec: 'tsc -b tsconfig.build.json' # a different file name
```

`value` is what the key resolved to **underneath** your layer, so you add a step without copying a
list you don't own:

```yaml
'[*]':
  run:
    build:
      after: "${{ [...value, 'node ../../support/stamp-assets.mjs'] }}"
```

It is the list form of whatever is there - a single inherited step spreads as one element, and
nothing inherited spreads as empty - so the spread needs no guard. There was a `+key` prefix for
this until rman 2.0; one still in a config is now refused, naming what to write instead.

And a selector narrows either to some packages:

```yaml
'[*-dialect]':
  publish:
    skip: true
```

### Overriding a `var` needs a selector block

This config declares its `vars` inside `"[platform:node]"`, and rman resolves an unmarked key as the
level's **floor** beneath every selector block at that level - including one that arrived through
`extends`. So an unmarked `vars` in your config loses to this one:

```yaml
# does NOT take - publish.npm.directory stays "build"
extends: '@panates/rman-preset'
vars:
  buildDir: dist

# takes
extends: '@panates/rman-preset'
'[platform:node]':
  vars:
    buildDir: dist
```

Measured both ways against a real repository; `"[*]"` works as well as `"[platform:node]"`. The
overridable vars are `buildDir`, `coveragePath`, `readmeFile` and `licenceFile`.

## Notes

- **No `compile` script.** `tsc --noEmit` cannot run against a project that other projects
  reference (`TS6310: Referenced project may not disable emit`), so a `compile` script shipped here
  would fail in every repository that used it. `rman build` is the type check.
- Repo-wide settings go at the top level of your own config, per-package ones under `"[*]"`.
  **An unmarked key reaches the directory that declares it and every package below** - inherited
  through `extends`, that means the root _and_ every package (measured). So a setting meant for the
  root alone is written `"[/]"`, which is why this config uses it for the aggregate coverage
  directory. `"[*]"` names the packages below and never the root, since the root is nobody's child.

## Licence

MIT
