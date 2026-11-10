/**
 * Content identity for Neural Signal Contract events.
 *
 * content_hash = SHA-256( domain_sep || canonical_utf8_bytes )
 *
 * Domain separation prevents cross-type collisions.
 * Content hashes identify canonical content only — not authenticity or authorization.
 */

import { sha256Hex } from '../sha256/hash.js';
import { canonicalizeBytes, serializationVersion } from './canonical.js';

export const HASH_ALGORITHM = 'sha-256';

const DOMAIN = {
  'signal.observation.v1': 'babelcodec:signal.observation.v1\0',
  'neural.inference.v1': 'babelcodec:neural.inference.v1\0',
  'feedback.decision.v1': 'babelcodec:feedback.decision.v1\0',
  'feature.vector.v1': 'babelcodec:feature.vector.v1\0',
};

/**
 * @param {string} schema
 * @param {object} eventBody - event without content_hash field
 * @returns {{ algorithm: string, serialization: string, hex: string, domain: string }}
 */
export function contentHash(schema, eventBody) {
  const domain = DOMAIN[schema];
  if (!domain) {
    throw new Error(`no domain separator for schema: ${schema}`);
  }
  // Strip any existing content_hash / content_identity before hashing
  const { content_hash, content_identity, ...rest } = eventBody || {};
  const bodyBytes = canonicalizeBytes(rest);
  const domainBytes = new TextEncoder().encode(domain);
  const combined = new Uint8Array(domainBytes.length + bodyBytes.length);
  combined.set(domainBytes, 0);
  combined.set(bodyBytes, domainBytes.length);
  const hex = sha256Hex(combined);
  return {
    algorithm: HASH_ALGORITHM,
    serialization: serializationVersion(),
    domain: schema,
    hex,
  };
}

/**
 * Attach content_identity to an event (does not mutate input).
 */
export function withContentIdentity(schema, event) {
  const id = contentHash(schema, event);
  return {
    ...event,
    content_identity: {
      algorithm: id.algorithm,
      serialization: id.serialization,
      hex: id.hex,
    },
  };
}
