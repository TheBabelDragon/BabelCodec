/**
 * BabelCodec MCP tool implementations.
 * All Unicode semantics come from the existing Rust WASM core via public APIs.
 * No duplicated normalization or script algorithms.
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

const TEXT_INDEX = pathToFileURL(
  join(config.REPO_ROOT, 'src', 'text', 'index.js'),
).href;
const SCRIPTS_INDEX = pathToFileURL(
  join(config.REPO_ROOT, 'src', 'scripts', 'index.js'),
).href;
const CORE_INDEX = pathToFileURL(
  join(config.REPO_ROOT, 'src', 'core', 'index.js'),
).href;

let textMod = null;
let scriptsMod = null;
let coreMod = null;
let engineReady = false;
let engineVersionCache = null;

async function loadModules() {
  if (!textMod) textMod = await import(TEXT_INDEX);
  if (!scriptsMod) scriptsMod = await import(SCRIPTS_INDEX);
  if (!coreMod) {
    try {
      coreMod = await import(CORE_INDEX);
    } catch {
      coreMod = null;
    }
  }
  return textMod;
}

/** Initialize Unicode Core. Fail hard — no silent JS fallback. */
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
  const adapters = scriptsMod.adapters
    ? Object.keys(scriptsMod.adapters)
    : ['hebrew'];

  let codecs = [];
  try {
    if (coreMod?.listCodecs) codecs = coreMod.listCodecs();
    else if (coreMod?.listCodecInfo) {
      codecs = coreMod.listCodecInfo().map((c) => c.id || c.name);
    }
  } catch {
    codecs = ['binary', 'hex', 'base64', 'ascii', 'utf8', 'morse', 'decimal', 'octal'];
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
    health: health
      ? { ok: health.ok, engineVersion: health.engineVersion }
      : null,
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
    return toolError(
      ErrorCode.INVALID_INPUT,
      `profile must be one of ${allowed.join(', ')}`,
    );
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
      engine_metadata: {
        engine: 'rust-wasm',
        engine_version: engineVersionCache,
      },
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

export async function babelcodec_inspect_hebrew({
  text,
  include_gematria = false,
}) {
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
      return toolError(
        ErrorCode.UNSUPPORTED_OPERATION,
        'hebrewAdapter is not available',
      );
    }

    const isHebrew = adapter.detects(text);
    const parsed = adapter.parse(text);
    const gematria =
      include_gematria && typeof adapter.gematriaStandard === 'function'
        ? adapter.gematriaStandard(text)
        : null;

    const canonical = await adapter.toCanonical(text, {
      gematria: !!include_gematria,
    });

    return envelope(
      'babelcodec_inspect_hebrew',
      {
        hebrew_detected: isHebrew,
        scalar_analysis: parsed.scalars || [],
        letter_count: parsed.letterCount ?? 0,
        final_letter_identification: (parsed.scalars || []).filter(
          (s) => s.isFinal,
        ),
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
    let list = [];
    let info = [];
    if (coreMod?.listCodecInfo) {
      info = coreMod.listCodecInfo();
      list = info.map((c) => c.id || c.name || c);
    } else if (coreMod?.listCodecs) {
      list = coreMod.listCodecs();
    } else {
      list = ['binary', 'hex', 'base64', 'ascii', 'utf8', 'morse', 'decimal', 'octal'];
    }
    return envelope('babelcodec_list_codecs', {
      codecs: list,
      codec_info: info.length ? info : null,
      supported_operations: ['encode', 'decode', 'convert', 'validate'],
      note: 'Codec registry from BabelCodec core public API.',
    });
  } catch {
    return toolError(ErrorCode.INTERNAL_ERROR, 'Failed to list codecs');
  }
}

/** Registry — future tools register here without changing transport. */
export const TOOL_REGISTRY = [
  {
    name: 'babelcodec_capabilities',
    description:
      'Return actual supported BabelCodec capabilities: engine version, codecs, script adapters, normalization profiles, inspection ops, WASM readiness, and known limitations.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: babelcodec_capabilities,
  },
  {
    name: 'babelcodec_inspect_text',
    description:
      'Inspect text via BabelCodec toCanonical(): code points, graphemes, primary/mixed scripts, normalization state, engine identity. Source is always preserved.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to inspect' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    handler: babelcodec_inspect_text,
  },
  {
    name: 'babelcodec_normalize_text',
    description:
      'Normalize text with an explicit profile (NONE, NFC, NFD, NFKC, NFKD) using the Rust-backed engine. Original source is never silently replaced.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to normalize' },
        profile: {
          type: 'string',
          enum: ['NONE', 'NFC', 'NFD', 'NFKC', 'NFKD'],
          description: 'Normalization profile',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    handler: babelcodec_normalize_text,
  },
  {
    name: 'babelcodec_detect_scripts',
    description:
      'Detect Unicode Script property distribution (primary script, distribution, mixed status). Not language identification.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to analyze' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    handler: babelcodec_detect_scripts,
  },
  {
    name: 'babelcodec_inspect_hebrew',
    description:
      'Hebrew script adapter: detection, scalar categories (letters, finals, niqqud, cantillation), optional standard gematria, canonical form.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to inspect for Hebrew' },
        include_gematria: {
          type: 'boolean',
          description: 'Include standard gematria analysis',
          default: false,
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    handler: babelcodec_inspect_hebrew,
  },
  {
    name: 'babelcodec_list_codecs',
    description:
      'Return the BabelCodec codec registry and supported encoding operations from the public API.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: babelcodec_list_codecs,
  },
];
