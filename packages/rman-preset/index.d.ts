import type { RmanNodeConfig } from 'rman';

export type { CopyFilesEntry, CopyFilesOptions } from './node/copy-files.js';
export { copyFiles } from './node/copy-files.js';

declare const config: RmanNodeConfig;
export default config;
