/**
 * ISO Base Media File Format (ISOBMFF) / HEIF box parser.
 * Pure JS, no dependencies. Safe against malformed sizes and truncation.
 */

const BOX_TYPE_LEN = 4;
const STANDARD_HEADER = 8;
const EXTENDED_SIZE_HEADER = 16;

/** Known HEIF-relevant box types */
export const HEIF_BOX_TYPES = new Set([
  'ftyp', 'meta', 'hdlr', 'pitm', 'iloc', 'iinf', 'infe',
  'iprp', 'ipco', 'ipma', 'ispe', 'pixi', 'colr', 'irot', 'imir',
  'clap', 'hvcC', 'av1C', 'mdat', 'idat', 'iref', 'dinf', 'dref',
  'url ', 'urn ', 'auxC', 'thmb', 'cdsc', 'dimg', 'grpl', 'udta',
  'Exif', 'mime', 'uuid', 'free', 'skip', 'moov', 'trak', 'mdia',
]);

/**
 * Read a 32-bit big-endian unsigned integer.
 * @param {Uint8Array} bytes
 * @param {number} offset
 */
export function readUint32BE(bytes, offset) {
  if (offset + 4 > bytes.length) throw new RangeError('readUint32BE: out of bounds');
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  ) >>> 0;
}

/**
 * Read a 64-bit size as Number when safe, else BigInt string.
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {{ value: number, exact: boolean }}
 */
export function readUint64BE(bytes, offset) {
  if (offset + 8 > bytes.length) throw new RangeError('readUint64BE: out of bounds');
  const hi = readUint32BE(bytes, offset);
  const lo = readUint32BE(bytes, offset + 4);
  // Number.MAX_SAFE_INTEGER is 2^53-1; if hi uses more than 21 bits, not safe
  if (hi > 0x1fffff) {
    return { value: Number.NaN, exact: false, hi, lo };
  }
  return { value: hi * 0x100000000 + lo, exact: true };
}

/**
 * Read fourcc type string.
 * @param {Uint8Array} bytes
 * @param {number} offset
 */
export function readFourCC(bytes, offset) {
  if (offset + 4 > bytes.length) throw new RangeError('readFourCC: out of bounds');
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

/**
 * Parse a single box header at offset.
 * Handles size=0 (to end of parent) and size=1 (64-bit extended size).
 *
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} end Exclusive end of parent region
 * @returns {{ type: string, size: number, headerSize: number, dataOffset: number, dataSize: number, largeSize: boolean, toEnd: boolean } | null}
 */
export function parseBoxHeader(bytes, offset, end) {
  if (offset + STANDARD_HEADER > end || offset + STANDARD_HEADER > bytes.length) {
    return null;
  }
  let size = readUint32BE(bytes, offset);
  const type = readFourCC(bytes, offset + 4);
  let headerSize = STANDARD_HEADER;
  let largeSize = false;
  let toEnd = false;

  if (size === 1) {
    // 64-bit extended size
    if (offset + EXTENDED_SIZE_HEADER > end || offset + EXTENDED_SIZE_HEADER > bytes.length) {
      return null;
    }
    const { value, exact } = readUint64BE(bytes, offset + 8);
    if (!exact || !Number.isFinite(value) || value < EXTENDED_SIZE_HEADER) {
      return null; // cannot safely represent or invalid
    }
    size = value;
    headerSize = EXTENDED_SIZE_HEADER;
    largeSize = true;
  } else if (size === 0) {
    // box extends to end of parent
    size = end - offset;
    toEnd = true;
  }

  if (size < headerSize) return null;
  if (offset + size > end) {
    // truncated — still report declared size but clamp usable region
    // caller decides how to handle
  }

  const dataOffset = offset + headerSize;
  const dataSize = Math.max(0, Math.min(size - headerSize, end - dataOffset, bytes.length - dataOffset));

  return {
    type,
    size,
    headerSize,
    dataOffset,
    dataSize,
    largeSize,
    toEnd,
    offset,
  };
}

/**
 * Walk boxes in a region [start, end).
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {object} [options]
 * @param {number} [options.maxBoxes=10000]
 * @param {boolean} [options.recursive=false]
 * @param {Set<string>} [options.containerTypes] types whose payload is more boxes
 * @returns {Array<object>}
 */
export function walkBoxes(bytes, start, end, options = {}) {
  const maxBoxes = options.maxBoxes ?? 10000;
  const recursive = options.recursive ?? false;
  const containerTypes = options.containerTypes ?? new Set([
    'meta', 'iprp', 'ipco', 'iinf', 'dinf', 'iref', 'grpl', 'moov', 'trak', 'mdia', 'minf', 'stbl',
  ]);
  const results = [];
  let offset = start;
  let count = 0;

  while (offset + STANDARD_HEADER <= end && offset + STANDARD_HEADER <= bytes.length && count < maxBoxes) {
    const header = parseBoxHeader(bytes, offset, end);
    if (!header) break;

    const box = {
      type: header.type,
      offset: header.offset,
      size: header.size,
      headerSize: header.headerSize,
      dataOffset: header.dataOffset,
      dataSize: header.dataSize,
      largeSize: header.largeSize,
      toEnd: header.toEnd,
      truncated: header.offset + header.size > end || header.offset + header.size > bytes.length,
      children: null,
    };

    // Fullbox version/flags for common boxes
    if (header.dataSize >= 4 && ['meta', 'hdlr', 'pitm', 'iloc', 'iinf', 'infe', 'ipma', 'iref'].includes(header.type)) {
      try {
        const vf = readUint32BE(bytes, header.dataOffset);
        box.version = (vf >>> 24) & 0xff;
        box.flags = vf & 0xffffff;
      } catch {
        /* ignore */
      }
    }

    if (recursive && containerTypes.has(header.type) && header.dataSize > 0) {
      let childStart = header.dataOffset;
      // FullBox payload starts after version/flags
      if (['meta', 'iinf', 'iloc', 'ipma', 'iref', 'infe'].includes(header.type)) {
        childStart = header.dataOffset + 4;
        if (header.type === 'iinf' && box.version !== undefined) {
          // entry_count follows
          childStart += box.version === 0 ? 2 : 4;
        }
      }
      if (header.type === 'meta') {
        // meta is FullBox; children start after version/flags
        childStart = header.dataOffset + 4;
      }
      const childEnd = Math.min(header.offset + header.size, end, bytes.length);
      if (childStart < childEnd) {
        box.children = walkBoxes(bytes, childStart, childEnd, {
          ...options,
          maxBoxes: maxBoxes - count,
        });
        count += box.children.length;
      }
    }

    results.push(box);
    count += 1;

    if (header.toEnd || header.size === 0) break;
    // Advance carefully against overflow
    const next = header.offset + header.size;
    if (next <= offset) break; // prevent infinite loop on zero/negative advance
    offset = next;
  }

  return results;
}

/**
 * Parse ftyp box fields.
 * @param {Uint8Array} bytes
 * @param {object} box from walkBoxes
 */
export function parseFtyp(bytes, box) {
  if (box.type !== 'ftyp' || box.dataSize < 8) return null;
  const majorBrand = readFourCC(bytes, box.dataOffset);
  const minorVersion = readUint32BE(bytes, box.dataOffset + 4);
  const compatibleBrands = [];
  for (let o = box.dataOffset + 8; o + 4 <= box.dataOffset + box.dataSize; o += 4) {
    compatibleBrands.push(readFourCC(bytes, o));
  }
  return { majorBrand, minorVersion, compatibleBrands };
}

/**
 * Flat list of all boxes with parent path.
 * @param {Array<object>} tree
 * @param {string} [parentPath='']
 */
export function flattenBoxTree(tree, parentPath = '') {
  const out = [];
  for (const box of tree) {
    const path = parentPath ? `${parentPath}/${box.type}` : box.type;
    out.push({ ...box, path, children: undefined });
    if (box.children?.length) {
      out.push(...flattenBoxTree(box.children, path));
    }
  }
  return out;
}
