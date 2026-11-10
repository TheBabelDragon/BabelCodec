# Shared Asset System

## Purpose

Suite-wide image (and binary) asset identity so Image Studio, Converter, Hex Inspector, Structure, Logic Lab, and Generate share one lifecycle model.

## Asset record

```js
{
  id: string,                 // stable
  filename: string,
  mimeType: string,
  width?: number,
  height?: number,
  byteLength: number,
  source: 'imported' | 'created' | 'transformed' | 'generated' | 'remote',
  createdAt: number,
  modifiedAt: number,
  parentId?: string,
  history: Array<{ op: string, at: number, detail?: object }>,
  provenance?: object,        // generation metadata, hashes, etc.
  // payload held separately in registry memory / IDB
}
```

## API

```js
import {
  createAssetRegistry,
  getDefaultRegistry,
} from 'babelcodec/media/assets';

const reg = getDefaultRegistry();
const asset = await reg.createFromBytes(bytes, {
  filename: 'shot.png',
  mimeType: 'image/png',
  source: 'imported',
});
const url = reg.getObjectUrl(asset.id); // managed; revoked on remove
const child = await reg.derive(asset.id, newBytes, {
  source: 'transformed',
  historyEntry: { op: 'crop', detail: { ... } },
});
```

## Rules

- Prefer references over copying large buffers when safe.
- Preserve original when applying destructive transforms (`derive` keeps parent).
- Revoke object URLs on remove/clear.
- Metadata is serializable; binary may live in memory and optionally IndexedDB.
- Quota / IDB failures degrade to memory-only without crashing the suite.
