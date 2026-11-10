# Image Generation Providers (studio view)

Canonical provider contract: [GENERATION_PROVIDERS.md](./GENERATION_PROVIDERS.md).

## Tiers

| Tier | Provider IDs | Network |
|------|--------------|---------|
| Local synthetic | `mock`, `procedural` | No |
| Remote gateway | `gateway` | Yes (operator URL) |

Local Image Studio editing does **not** require any provider.

## Security

No API keys in the browser. Remote keys only on `services/generation-gateway`. See [GENERATION_SECURITY.md](./GENERATION_SECURITY.md) and [IMAGE_GEN_SETUP.md](./IMAGE_GEN_SETUP.md).
