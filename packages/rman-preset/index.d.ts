import type { RmanNodeConfig } from 'rman';
import './node/rmanrc.js';

export type { CopyFilesEntry, CopyFilesOptions } from './node/copy-files.js';
export { copyFiles } from './node/copy-files.js';
export type { StampFilesEntry, StampFilesOptions } from './node/stamp-files.js';
export { stampFiles } from './node/stamp-files.js';

declare const config: RmanNodeConfig;
export default config;
