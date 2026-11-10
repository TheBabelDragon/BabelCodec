# neural.inference.v1

Required:

- `schema` = `"neural.inference.v1"`
- `event_id`, `model_id`, `model_version`
- `input_observation_ids` (non-empty string array)

Recommended:

- `prediction`, `confidence`, `confidence_semantics`
- `model_artifact_id`, `scores`, `attribution`, `causation_ids`

Confidence is **not** assumed to be a calibrated probability unless `confidence_semantics` says so.
