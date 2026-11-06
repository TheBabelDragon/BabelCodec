# Packet Layouts

User-defined field maps over a buffer. Layouts are **interpretations**, not claims that the buffer follows a known protocol.

## Schema

```json
{
  "name": "example",
  "fields": [
    { "name": "msgId", "offset": 0, "length": 2, "type": "uint16", "endian": "big" },
    { "name": "payload", "offset": 8, "length": 4, "type": "bytes" }
  ]
}
```

## Validation

- Offsets and lengths must be non-negative integers
- Fields must not exceed buffer length
- Overlapping fields are reported as errors
- Gaps are allowed and counted
- Duplicate field names are errors
- Import/export uses JSON; invalid JSON is rejected before apply

Source buffers are never modified.
