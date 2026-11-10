# signal.observation.v1

Required fields:

- `schema` = `"signal.observation.v1"`
- `event_id` (string)
- `source_system` (string)
- `source_node_id` (string)
- `source_sequence` (finite number)
- `observation_type` (string)
- `features` (array of feature objects)

Recommended:

- `source_timestamp`, `ingestion_timestamp`, `clock_domain`
- `provenance`, `correlation_id`, `raw_ref`

After hashing, `content_identity: { algorithm, serialization, hex }` is attached.

See `docs/NEURAL_SIGNAL_CONTRACT.md`.
