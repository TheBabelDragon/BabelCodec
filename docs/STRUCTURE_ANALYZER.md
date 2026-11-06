# Structure Analyzer

Interpret a selected byte range with explicit types and endianness.

## Types

| Type     | Size | Notes                          |
|----------|------|--------------------------------|
| uint8/int8 | 1  |                                |
| uint16/int16 | 2 | LE / BE                      |
| uint32/int32 | 4 | LE / BE                      |
| uint64/int64 | 8 | `BigInt` values              |
| float32/float64 | 4/8 | IEEE-754, NaN, ±Infinity |
| hex / decimal / binary | n | display forms           |
| ascii / utf8 | n | validity reported           |

Insufficient length produces an explicit error for that type; other types still render.

Endianness is never taken from the host.
