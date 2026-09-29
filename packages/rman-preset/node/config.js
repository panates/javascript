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
      readmeFile: 'README.md',
      licenceFile: 'LICENCE',
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
            const buildDir = pkg.config.publish?.npm?.directory ?? 'build';
            for (const name of [vars.readmeFile, vars.licenceFile]) {
              if (!name) continue;
              const from = [pkg.dirname, repository.dirname].map((d) => path.resolve(d, name)).find(fs.existsSync);
              if (from) fs.copyFileSync(from, path.resolve(pkg.dirname, buildDir, path.basename(name)));
            }
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
