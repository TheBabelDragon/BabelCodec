# TPU / Compute Backends

## Interface

Backends register via `registerTpuBackend`:

```js
import { registerTpuBackend } from 'babelcodec/media/generation';

registerTpuBackend({
  id: 'my-tpu',
  displayName: 'Lab TPU',
  operations: ['prepare_prompt'],
  async healthCheck() {
    return {
      available: true,
      status: 'healthy',
      operations: ['prepare_prompt'],
      supportedModels: [],
      precision: ['bf16'],
    };
  },
  async invoke(operation, input, { signal }) {
    if (operation === 'prepare_prompt') {
      return { prompt: input.prompt }; // optional rewrite
    }
    throw new Error('unsupported operation');
  },
});
```

## Guarantees

- Capability discovery uses **explicit registration + health checks** only.
- Browser WebGL / WebGPU presence is **not** treated as TPU proof.
- Image generation providers are separate; a TPU backend does not imply on-device diffusion.
- When no backend is available, the `none` sentinel reports `available: false`.

## Optional assist

If `useTpu` is set and the backend advertises `prepare_prompt`, the orchestrator may request prompt preparation during `PREPARING`. Failure of the assist path does not fail the job; generation continues with the original prompt.
