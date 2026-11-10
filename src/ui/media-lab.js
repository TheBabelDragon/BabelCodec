/**
 * Image Studio entry — re-exports Create/Convert/Inspect/Batch/Generate workbench.
 * Query on studio-ui forces clients past stale module caches after UI fixes.
 */
export { createMediaLab } from './studio-ui.js?v=0.11.2';
