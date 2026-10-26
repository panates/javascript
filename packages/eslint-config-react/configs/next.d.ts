import { Linter } from 'eslint';

declare const config: Linter.Config[];

/** Next's `core-web-vitals` config in flat form, from a 15.x or a 16.x `@next/eslint-plugin-next`. */
export declare function coreWebVitals(plugin: {
  configs: Record<string, unknown>;
  flatConfig?: Record<string, unknown>;
}): Linter.Config;

export default config;
