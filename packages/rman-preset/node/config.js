import fs from 'fs';
import path from 'path';
import checkCommand from './commands/check.js';
import formatCommand from './commands/format.js';
import lintCommand from './commands/lint.js';

/**
 * @type {import('rman').RmanNodeConfig}
 */
export default {
  changelog: {
    unreleased: false,
  },

  '[platform:node]': {
    commands: [checkCommand, formatCommand, lintCommand],

    vars: {
      coveragePath: '${{ path.join(repository.dirname, "coverage") }}',
      buildDir: 'build',
      copyFiles: ['README.md', 'LICENSE'],
    },

    '[/]': {
      clean: {
        include: '${{ [...value, vars.coveragePath] }}',
      },
    },

    '[*]': {
      group: false,

      version: {
        stamp: ['src/constants.ts'],
      },

      publish: {
        npm: {
          directory: '${{ vars.buildDir }}',
        },
      },

      clean: {
        include: "${{ [...value, vars.buildDir, '*.tsbuildinfo', path.join(vars.coveragePath, pkg.basename)] }}",
      },

      run: {
        build: {
          before: ['rman check', 'rman lint', 'rman clean'],
          exec: buildWithTsc,
          /* **`vars` is read off the package, not off the argument.** A function step is handed
           * exactly `pkg`, `repository`, `cwd`, `runBin` and `logger` - destructuring `vars` there
           * yields `undefined`, and the first `vars.readmeFile` throws. `pkg.config.vars` is the
           * resolved scope for this package, which is what the hook wanted in the first place. */
          after: ({ pkg, repository }) => {
            /* Annotated because `vars` is free-form by contract - rman cannot know these two hold
             * strings, so without it `path.resolve(d, name)` is passed `{}`. */
            const vars = /** @type {Record<string, string | undefined>} */ (pkg.config.vars ?? {});
            const copyFiles = vars.copyFiles ? (Array.isArray(vars.copyFiles) ? vars.copyFiles : [vars.copyFiles]) : [];
            const buildDir = pkg.config.publish?.npm?.directory ?? 'build';
            for (const name of copyFiles) {
              if (!name) continue;
              const from = [pkg.dirname, repository.dirname].map((d) => path.resolve(d, name)).find(fs.existsSync);
              if (from) fs.copyFileSync(from, path.resolve(pkg.dirname, buildDir, path.basename(name)));
            }
            writeBuildManifest(pkg, buildDir);
          },
        },
      },
    },
  },
};

async function buildWithTsc({ pkg, runBin }) {
  const candidates = ['tsconfig-build.json', 'tsconfig.build.json', 'tsconfig.json'];
  const tsconfig = candidates.map((name) => path.join(pkg.dirname, name)).find(fs.existsSync);
  if (!tsconfig) {
    throw new Error(
      `${pkg.name} has none of ${candidates.join(', ')} - there is nothing for "tsc -b" to ` +
        `build. Add one, or keep this package out of the build with .rmanrc ` +
        `"[${pkg.name}]": { run: { build: { skip: true } } }.`,
    );
  }
  await runBin('tsc', ['-b', tsconfig]);
}

/** The only lifecycle scripts a consumer's `npm install` runs, so the only ones worth keeping in a
 *  built package. https://docs.npmjs.com/cli/using-npm/scripts */
const CONSUMER_SCRIPTS = new Set(['preinstall', 'install', 'postinstall']);

/**
 * Writes the package's manifest into the build directory, stripped of everything a consumer has no
 * use for: `devDependencies`, `private`, `publishConfig.directory`, and every script except the
 * three install hooks.
 *
 * **This never decides what is published.** `rman publish` derives its own manifest into the same
 * file at publish time, and its `preparePublishManifest` reads whatever is already there first and
 * writes it back afterwards - so this copy is overwritten for the duration of the publish and
 * restored when it ends. The rules here mirror rman's `derivePublishManifest` so the two agree, but
 * if they ever drift, rman's is the one that ships.
 *
 * What it is for is the build directory being a complete package on its own: `node build/index.js`
 * needs a `package.json` beside it to pick up `"type": "module"`, and anything inspecting what a
 * release will contain can read it without running a publish.
 *
 * **`"workspace:"` ranges are deliberately left as they are.** Resolving them needs every package in
 * the repository, which is rman's job and which `publish` does on its own copy. A build-time
 * resolution would be a second implementation of it, free to disagree.
 */
function writeBuildManifest(pkg, buildDir) {
  const json = structuredClone(pkg.manifest.raw);

  delete json.devDependencies;
  delete json.private;

  if (json.scripts) {
    const kept = Object.fromEntries(Object.entries(json.scripts).filter(([name]) => CONSUMER_SCRIPTS.has(name)));
    if (Object.keys(kept).length) json.scripts = kept;
    else delete json.scripts;
  }

  if (json.publishConfig) {
    delete json.publishConfig.directory;
    if (!Object.keys(json.publishConfig).length) delete json.publishConfig;
  }

  const dir = path.resolve(pkg.dirname, buildDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json, undefined, 2) + '\n', 'utf-8');
}
