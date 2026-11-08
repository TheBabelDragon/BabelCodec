# Generation Providers

## Built-in

| ID | Network | Notes |
|----|---------|-------|
| `mock` | No | Deterministic solid-color PNG; CI and offline demos |

## Contract

```js
{
  id: string,
  displayName?: string,
  requiresNetwork?: boolean,
  getCapabilities?: () => Promise<object> | object,
  generate: (request, { signal, onProgress }) => Promise<{
    providerJobId?: string,
    results: Array<{
      variantIndex: number,
      asset: {
        bytes: Uint8Array,
        mimeType: string,
        width?: number,
        height?: number,
        filename?: string,
      },
      providerMetadata?: object,
    }>,
  }>,
  poll?: (providerJobId) => Promise<object>,
  cancel?: (providerJobId) => Promise<void>,
}
```

Register with `registerProvider(provider)` before opening Image Studio Generate, or at app init.

## Configuration examples

**Offline only (default):** no configuration required.

**Remote via gateway (sketch):**

```js
registerProvider({
  id: 'gateway',
  displayName: 'Lab Gateway',
  requiresNetwork: true,
  async generate(request, { signal, onProgress }) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: request.prompt,
        width: request.width,
        height: request.height,
      }),
      signal,
    });
    if (!res.ok) throw new Error('gateway error ' + res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      results: [{
        variantIndex: 0,
        asset: { bytes: buf, mimeType: res.headers.get('content-type') || 'image/png' },
      }],
    };
  },
});
```

Never place provider API keys in this file or in any client bundle.
