# Safe Passthrough

Detection never requires conversion. The original input remains available when:

- The payload is unknown or malformed
- Multiple formats are present
- No compatible destination exists
- A parser rejects the input

## Alert levels

| Level | Use |
|-------|-----|
| info | Recognized format / embedded segment |
| warning | Partial, ambiguous, truncated, unclassified |
| security | Resource limits, archive no-auto-extract, excessive nesting |
| unsupported | Recognized but no decoder/destination |

Security alerts are evidence-based. A recognized executable or archive format is not treated as malware proof.

## Boundaries

- Never execute detected content or evaluate scripts
- Never auto-extract archives or fetch URLs
- Enforce size, depth, segment, and work limits
- Require explicit user action for destructive transforms
