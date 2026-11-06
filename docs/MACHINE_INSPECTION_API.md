# Machine Inspection API

```js
import {
  snapshotSha256Machine,
  inspectComponent,
  inspectAdd32,
  ExecutionHistory,
  EXTENSION_POINTS,
} from 'babelcodec/computer';
```

Component ids: `reg.working.A`…`H`, `bus.T1|T2|W|K`, `mem.W|K|hash`, `ctrl`, `datapath.round`, `adder.ripple32`.
