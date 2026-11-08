# Generation Security

## Principles

BabelCodec remains offline-first. Image generation extends that model; it does not replace it.

- **No secrets in the client.** Provider API keys must never appear in shipped JavaScript.
- **Explicit remote disclosure.** UI labels mark remote providers. Users are not silently opted into network calls.
- **Local stays local.** Convert, Inspect, Create, Batch, Hex Inspector, and all encoding tools work with zero network.
- **Untrusted provider input.** Response bytes are size-limited and treated as data. Content types and dimensions are validated where practical.
- **No credential leakage.** Job metadata, logs, and error strings must not include tokens or authorization headers.

## Gateway pattern

For authenticated remote generation, run a small gateway you control:

```
Browser (BabelCodec)  →  your gateway  →  provider API
         (no secrets)     (holds keys)
```

Register a provider whose `generate()` calls your gateway origin. Configure the gateway URL outside the repository (environment / user settings), not as a hardcoded secret.

## Offline mode

When no remote provider is registered (default), only the deterministic mock provider is available. All other BabelCodec functionality is unchanged.

## Threat notes

- Malformed provider payloads must not execute code (`eval`-free pipeline).
- Object URLs for previews are revoked on gallery refresh.
- Default asset size ceiling: 12 MiB per result in the orchestrator.
