/**
 * BabelCodec MCP tool implementations.
 * Unicode semantics come only from the existing Rust WASM core via public APIs.
 * No fabricated codec lists; registry failure is an explicit error.
 */

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { config } from './config.js';
import {
  ErrorCode,
  toolError,
  toolSuccess,
  classifyEngineError,
} from './errors.js';
import { assertTextLength } from './auth.js';

const TEXT_INDEX = pathToFileURL(join(config.REPO_ROOT, 'src', 'text', 'index.js')).href;
const SCRIPTS_INDEX = pathToFileURL(join(config.REPO_ROOT, 'src', 'scripts', 'index.js')).href;
const CORE_INDEX = pathToFileURL(join(config.REPO_ROOT, 'src', 'core', 'index.js')).href;

let textMod = null;
let scriptsMod = null;
let coreMod = null;
let coreLoadError = null;
let engineReady = false;
let engineVersionCache = null;

async function loadModules() {
  if (!textMod) textMod = await import(TEXT_INDEX);
  if (!scriptsMod) scriptsMod = await import(SCRIPTS_INDEX);
  if (!coreMod && !coreLoadError) {
    try {
      coreMod = await import(CORE_INDEX);
    } catch (e) {
      coreLoadError = e;
      coreMod = null;
    }
  }
  return textMod;
}

export async function ensureEngine() {
  await loadModules();
  try {
    await textMod.initializeUnicodeCore({ allowRetry: true });
    engineReady = textMod.isUnicodeCoreReady();
    engineVersionCache = textMod.engineVersion?.() || null;
    if (!engineReady) {
      throw new Error('Unicode Core reported not ready after initialize');
    }
    return true;
  } catch (e) {
    engineReady = false;
    throw e;
  }
}

export function isEngineReady() {
  return engineReady;
}

export function getEngineVersion() {
  return engineVersionCache;
}

function envelope(tool, result, diagnostics = []) {
  return toolSuccess(tool, result, {
    engine: 'rust-wasm',
    engine_version: engineVersionCache,
    diagnostics,
  });
}

export async function babelcodec_capabilities() {
  try {
    await ensureEngine();
  } catch (e) {
    const { code, message } = classifyEngineError(e);
    return toolError(code, message, {
      wasm_ready: false,
      hint: 'Run npm run build:wasm from the monorepo root and ensure pkg/ is present.',
    });
  }

  await loadModules();
  const health = textMod.getHealthReport?.() || null;
  const adapters = scriptsMod.adapters ? Object.keys(scriptsMod.adapters) : [];

  let codecs = null;
  let codecError = null;
  try {
    if (coreMod?.listCodecInfo) {
      codecs = coreMod.listCodecInfo().map((c) => c.id || c.name).filter(Boolean);
    } else if (coreMod?.listCodecs) {
      codecs = coreMod.listCodecs();
    } else {
      codecError = coreLoadError
        ? 'core module failed to load'
        : 'codec registry exports not found on core module';
    }
  } catch (e) {
    codecError = e?.message || 'codec registry load failed';
  }

  if (codecError || !Array.isArray(codecs)) {
    return toolError(ErrorCode.INTERNAL_ERROR, 'Codec registry unavailable', {
      reason: codecError || 'empty registry',
    });
  }

  return envelope('babelcodec_capabilities', {
    server: { name: config.SERVER_NAME, version: config.SERVER_VERSION },
    engine_version: engineVersionCache,
    unicode_engine: 'rust-wasm',
    wasm_ready: true,
    available_codecs: codecs,
    available_script_adapters: adapters,
    normalization_profiles: ['NONE', 'NFC', 'NFD', 'NFKC', 'NFKD'],
    inspection_operations: [
      'toCanonical',
      'detectScripts',
      'segmentGraphemes',
      'applyNormalization',
      'hebrewAdapter.parse',
      'hebrewAdapter.gematriaStandard',
    ],
    known_limitations: [
      'Script detection reports Unicode Script property, not natural-language identification.',
      'Non-Hebrew script adapters are detection stubs only.',
      'No natural-language translation is provided by this server.',
      'WASM must be built (npm run build:wasm) for the Node process to load the Unicode core.',
    ],
    health: health ? { ok: !!health.ok, engineVersion: health.engineVersion || null } : null,
  });
}

export async function babelcodec_inspect_text({ text }) {
  const len = assertTextLength(text);
  if (!len.ok) return toolError(ErrorCode.INVALID_INPUT, len.message);
  try {
    await ensureEngine();
  } catch (e) {
    const { code, message } = classifyEngineError(e);
    return toolError(code, message);
  }
  try {
    const canonical = await textMod.toCanonical(text);
    return envelope(
      'babelcodec_inspect_text',
      {
        canonical_representation: {
          schema: canonical.schema,
          source: canonical.source,
          analysis: canonical.analysis,
          graphemes: canonical.graphemes,
          grapheme_method: canonical.graphemeMethod,
          script: canonical.script,
          scripts: canonical.scripts,
          mixed_scripts: canonical.mixedScripts,
          normalization: canonical.normalization,
        },
        original_source: text,
        code_points: canonical.source?.codepoints || [],
        grapheme_segmentation: canonical.graphemes || [],
        primary_script: canonical.script,
        mixed_script_detection: !!canonical.mixedScripts,
        normalization_state: canonical.normalization,
        engine_identity: {
          engine: canonical.engine,
          engine_version: canonical.engineVersion || engineVersionCache,
        },
      },
      canonical.diagnostics || [],
    );
  } catch (e) {
    const { code, message } = classifyEngineError(e);
    return toolError(code, message);
  }
}

export async function babelcodec_normalize_text({ text, profile = 'NONE' }) {
  const len = assertTextLength(text);
  if (!len.ok) return toolError(ErrorCode.INVALID_INPUT, len.message);
  const allowed = ['NONE', 'NFC', 'NFD', 'NFKC', 'NFKD'];
  const p = String(profile || 'NONE').toUpperCase();
  if (!allowed.includes(p)) {
    return toolError(ErrorCode.INVALID_INPUT, `profile must be one of ${allowed.join(', ')}`);
  }
  try {
    await ensureEngine();
  } catch (e) {
    const { code, message } = classifyEngineError(e);
    return toolError(code, message);
  }
  try {
    const res = await textMod.applyNormalization(text, p);
    return envelope('babelcodec_normalize_text', {
      original_source: text,
      normalized_result: res.text,
      selected_profile: res.profile,
      changed: !!res.changed,
      engine_metadata: { engine: 'rust-wasm', engine_version: engineVersionCache },
    });
  } catch (e) {
    const { code, message } = classifyEngineError(e);
    return toolError(code, message);
  }
}

export async function babelcodec_detect_scripts({ text }) {
  const len = assertTextLength(text);
  if (!len.ok) return toolError(ErrorCode.INVALID_INPUT, len.message);
  try {
    await ensureEngine();
  } catch (e) {
    const { code, message } = classifyEngineError(e);
    return toolError(code, message);
  }
  try {
    const res = await textMod.detectScripts(text);
    return envelope('babelcodec_detect_scripts', {
      primary_script: res.primary || 'Unknown',
      script_distribution: res.scripts || {},
      mixed_script_status: !!res.mixed,
      note: 'Values are Unicode Script property labels, not language identifiers.',
    });
  } catch (e) {
    const { code, message } = classifyEngineError(e);
    return toolError(code, message);
  }
}

export async function babelcodec_inspect_hebrew({ text, include_gematria = false }) {
  const len = assertTextLength(text);
  if (!len.ok) return toolError(ErrorCode.INVALID_INPUT, len.message);
  try {
    await ensureEngine();
  } catch (e) {
    const { code, message } = classifyEngineError(e);
    return toolError(code, message);
  }
  try {
    await loadModules();
    const adapter = scriptsMod.hebrewAdapter;
    if (!adapter) {
      return toolError(ErrorCode.UNSUPPORTED_OPERATION, 'hebrewAdapter is not available');
    }
    const isHebrew = adapter.detects(text);
    const parsed = adapter.parse(text);
    const gematria =
      include_gematria && typeof adapter.gematriaStandard === 'function'
        ? adapter.gematriaStandard(text)
        : null;
    const canonical = await adapter.toCanonical(text, { gematria: !!include_gematria });
    return envelope(
      'babelcodec_inspect_hebrew',
      {
        hebrew_detected: isHebrew,
        scalar_analysis: parsed.scalars || [],
        letter_count: parsed.letterCount ?? 0,
        final_letter_identification: (parsed.scalars || []).filter((s) => s.isFinal),
        niqqud_count: parsed.niqqudCount ?? 0,
        cantillation_count: parsed.cantillationCount ?? 0,
        gematria,
        canonical_representation: {
          schema: canonical.schema,
          source: canonical.source,
          script: canonical.script,
          mixed_scripts: canonical.mixedScripts,
        },
      },
      canonical.diagnostics || [],
    );
  } catch (e) {
    const { code, message } = classifyEngineError(e);
    return toolError(code, message);
  }
}

export async function babelcodec_list_codecs() {
  try {
    await loadModules();
    if (coreLoadError || !coreMod) {
      return toolError(ErrorCode.INTERNAL_ERROR, 'Codec registry unavailable', {
        reason: coreLoadError?.message || 'core module not loaded',
      });
    }
    let list;
    let info = [];
    if (coreMod.listCodecInfo) {
      info = coreMod.listCodecInfo();
      list = info.map((c) => c.id || c.name || c).filter(Boolean);
    } else if (coreMod.listCodecs) {
      list = coreMod.listCodecs();
    } else {
      return toolError(ErrorCode.INTERNAL_ERROR, 'Codec registry exports missing');
    }
    if (!Array.isArray(list) || list.length === 0) {
      return toolError(ErrorCode.INTERNAL_ERROR, 'Codec registry empty');
    }
    return envelope('babelcodec_list_codecs', {
      codecs: list,
      codec_info: info.length ? info : null,
      supported_operations: ['encode', 'decode', 'convert', 'validate'],
      note: 'Codec registry from BabelCodec core public API.',
    });
  } catch (e) {
    return toolError(ErrorCode.INTERNAL_ERROR, 'Failed to list codecs', {
      reason: e?.message || 'unknown',
    });
  }
}

export const TOOL_HANDLERS = {
  babelcodec_capabilities,
  babelcodec_inspect_text,
  babelcodec_normalize_text,
  babelcodec_detect_scripts,
  babelcodec_inspect_hebrew,
  babelcodec_list_codecs,
};
