# Experiment Format

Schema: `babelcodec.experiment.v1`

```js
import { createExperiment, parseExperiment, compareSnapshots } from 'babelcodec/computer';
```

Fields: architecture, input, snapshots, history, trace, breakpoints, watches, output, validation.

`parseExperiment` rejects unknown schemas and oversized history/trace.
