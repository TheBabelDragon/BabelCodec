# Artifact History / Output Ledger

Every meaningful pipeline output is recorded with parent linkage and complete bytes.

## API

```js
import {
  getDefaultLedger,
  ingestInput,
  getArtifactHistory,
  getArtifactOutput,
  verifyArtifactOutput,
  restoreArtifactRevision,
} from 'babelcodec/media/artifacts';

const { artifact, detection, analysis, ledgerRecord } = await ingestInput(input);
const history = getArtifactHistory(artifact.id);
const out = getArtifactOutput(artifact.id, artifact.revision);
const check = verifyArtifactOutput(artifact.id, artifact.revision);
const restored = restoreArtifactRevision(artifact.id, 1);
```

## Storage

- In-memory by default with optional IndexedDB (`babelcodec-ledger-v1`).
- Large binaries are not stored in `localStorage`.
- Quota failures set `storageStatus: 'quota_exceeded'` and do not claim false preservation when bytes are unavailable.
- Evicted records set `exportAvailable: false`.

## Guarantees

- Derived outputs do not overwrite parents.
- Restore creates a working snapshot; later revisions remain listed.
- Export operates on complete bytes, never a UI preview.
