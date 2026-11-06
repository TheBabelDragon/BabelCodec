/**
 * BabelCodec conversion errors.
 * Explicit diagnostics — no silent failures.
 */

export class ConversionError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, offset?: number, input?: string, details?: object }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'ConversionError';
    this.code = meta.code || 'CONVERSION_ERROR';
    this.offset = meta.offset;
    this.input = meta.input;
    this.details = meta.details || {};
  }
}

export class ValidationError extends ConversionError {
  constructor(message, meta = {}) {
    super(message, { ...meta, code: meta.code || 'VALIDATION_ERROR' });
    this.name = 'ValidationError';
  }
}

export class MalformedInputError extends ConversionError {
  constructor(message, meta = {}) {
    super(message, { ...meta, code: meta.code || 'MALFORMED_INPUT' });
    this.name = 'MalformedInputError';
  }
}
