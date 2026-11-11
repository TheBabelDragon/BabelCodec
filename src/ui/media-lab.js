/**
 * Image Studio entry — re-exports Playground/Create/Convert/Inspect/Batch/Generate.
 * Query on studio-ui forces clients past stale module caches after UI fixes.
 */
export { createMediaLab } from './studio-ui.js?v=0.12.0';
