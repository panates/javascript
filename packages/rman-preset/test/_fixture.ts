import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Repository } from 'rman';

/**
 * A throwaway repository that `extends` this package, resolved by a **real rman**.
 *
 * That is the only honest way to test a config package: what it exports is not a function with a
 * return value but a *claim about what rman will resolve*, and every mistake this suite exists to
 * catch - a `value` with nothing underneath it, a selector reaching the root, a key duplicated
 * across two blocks - is invisible until rman has merged, interpolated and cascaded the thing.
 * Asserting on the exported object instead would test the file against itself.
 */
export interface FixtureOptions {
  /** Extra packages beyond `pkg-a`, each an empty workspace member. */
  packages?: string[];
  /** Files to write, keyed by repository-relative path. */
  files?: Record<string, string>;
  /** Leave the packages without a `tsconfig.json`, for the one spec about a package that has none. */
  noTsconfig?: boolean;
  /** The root `.rmanrc.yml`. Defaults to nothing but the `extends`. */
  rmanrc?: string;
}

const dirs: string[] = [];

export function fixtureDir(options: FixtureOptions = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panates-rman-preset-'));
  dirs.push(dir);

  write(dir, 'package.json', JSON.stringify({ name: 'root', private: true, workspaces: ['packages/*'] }));
  write(dir, '.rmanrc.yml', options.rmanrc ?? `extends: '${PACKAGE_NAME}'\n`);

  /**
   * `extends` resolves a bare name through **the config file's own** `node_modules`, so the
   * temporary repository needs to be able to see this package and the plugin it names. Linked
   * rather than installed: an `npm install` per test would dominate the runtime, and the link is
   * what a workspace gives you anyway.
   *
   * **Only `rman` now.** There was a second link for `rman-node`, and that package no longer
   * exists - the Node built-in ships inside rman. The link went on being created, dangling, until
   * something asked what it pointed at.
   *
   * Nothing has to ask for it either: rman 2 lays its own presets under every repository root, so
   * a repository that declares no technology at all still reads its packages as npm packages.
   * (`plugins: ['node']` was the spelling while that was a plugin, and it is not valid in 2.x -
   * `plugins` takes a plugin or a glob naming modules that export one, never a package name.)
   */
  const modules = path.join(dir, 'node_modules');
  fs.mkdirSync(path.join(modules, '@panates'), { recursive: true });
  fs.symlinkSync(PACKAGE_ROOT, path.join(modules, PACKAGE_NAME));
  fs.symlinkSync(resolvePackage('rman'), path.join(modules, 'rman'));

  for (const name of ['pkg-a', ...(options.packages ?? [])]) {
    write(dir, `packages/${name}/package.json`, JSON.stringify({ name, version: '1.0.0' }));
    /** Every package gets one, because the build step throws when a package has none -
     *  deliberately, so `tsc -b` is never left with no argument. It throws when `build` *runs*
     *  rather than while the config resolves, so a fixture without one is now a perfectly usable
     *  repository; the spec that cares asks the step directly. */
    if (!options.noTsconfig) write(dir, `packages/${name}/tsconfig.json`, '{}');
  }
  for (const [rel, content] of Object.entries(options.files ?? {})) write(dir, rel, content);
  return dir;
}

export function repositoryFor(options: FixtureOptions = {}): Promise<Repository> {
  return Repository.create(fixtureDir(options));
}

/** Removed once, at the end - a `beforeEach` that built and tore down a repository per case would
 *  spend most of the suite in the filesystem. */
export function cleanupFixtures(): void {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

const PACKAGE_NAME = '@panates/rman-preset';
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');

function write(dir: string, rel: string, content: string): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** The installed copy in *this* repository, which is what the fixture links in. */
function resolvePackage(name: string): string {
  return path.resolve(import.meta.dirname, '../../../node_modules', name);
}
