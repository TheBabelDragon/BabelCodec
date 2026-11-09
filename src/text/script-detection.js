/**
 * Script detection — canonical path is the Rust unicode-script crate.
 */

import {
  initializeUnicodeCore,
  detectScripts as rustDetectScripts,
} from './unicode-core-loader.js';

export async function detectScripts(text) {
  if (typeof text !== 'string') {
    return { primary: 'Unknown', scripts: {}, mixed: false };
  }
  await initializeUnicodeCore();
  const res = await rustDetectScripts(text);
  return {
    primary: res.primary || 'Unknown',
    scripts: res.scripts || {},
    mixed: !!res.mixed,
  };
}
