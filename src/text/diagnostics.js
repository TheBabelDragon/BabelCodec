/**
 * Structured diagnostics for text processing.
 */

export function makeDiagnostic(code, message, extra = {}) {
  return Object.freeze({
    code,
    message,
    ...extra,
  });
}
