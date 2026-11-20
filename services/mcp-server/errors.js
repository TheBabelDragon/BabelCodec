/**
 * Protocol-compliant error codes and helpers for BabelCodec MCP tools.
 * Never expose stack traces, env vars, or secrets in client-facing errors.
 */

export const ErrorCode = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  ENGINE_NOT_READY: 'ENGINE_NOT_READY',
  WASM_INITIALIZATION_FAILED: 'WASM_INITIALIZATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMIT: 'RATE_LIMIT',
  BODY_TOO_LARGE: 'BODY_TOO_LARGE',
  BAD_JSON: 'BAD_JSON',
});

/**
 * Structured tool error result (returned inside the envelope, not thrown as HTTP 500).
 * @param {string} code - one of ErrorCode
 * @param {string} message - safe client message
 * @param {object} [detail]
 */
export function toolError(code, message, detail = null) {
  return {
    schema: 'babelcodec.mcp.error.v1',
    success: false,
    code,
    message: String(message || 'error'),
    detail: detail && typeof detail === 'object' ? detail : null,
  };
}

/**
 * Successful tool envelope.
 */
export function toolSuccess(tool, result, opts = {}) {
  return {
    schema: 'babelcodec.mcp.result.v1',
    success: true,
    tool,
    engine: opts.engine || 'rust-wasm',
    engine_version: opts.engine_version || null,
    result,
    diagnostics: Array.isArray(opts.diagnostics) ? opts.diagnostics : [],
  };
}

/**
 * Map known engine failures to stable codes.
 */
export function classifyEngineError(err) {
  const msg = err?.message || String(err);
  if (/WASM|unicode.?core|failed to load|health check/i.test(msg)) {
    return {
      code: ErrorCode.WASM_INITIALIZATION_FAILED,
      message: 'Unicode Core WASM failed to initialize',
    };
  }
  if (/not initialized|not ready|ENGINE/i.test(msg)) {
    return {
      code: ErrorCode.ENGINE_NOT_READY,
      message: 'Unicode engine is not ready',
    };
  }
  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Internal engine error',
  };
}

/**
 * Safe HTTP JSON error (no stack, no secrets).
 */
export function httpErrorBody(code, message, status = 400) {
  return {
    error: String(message || 'error'),
    code: String(code || ErrorCode.INTERNAL_ERROR),
    status,
  };
}
