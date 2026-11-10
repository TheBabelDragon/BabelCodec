# feedback.decision.v1

Required:

- `schema` = `"feedback.decision.v1"`
- `event_id`, `decision_id`
- `causation_ids` (array)
- `authorization_state` ∈ none|proposed|approved|rejected|executed|failed|cancelled
- `execution_state` ∈ not_applicable|pending|executed|failed|cancelled

Safety: `authorization_state` of proposed/rejected/cancelled/none **must not** pair with `execution_state=executed`.

BabelCodec records proposals only; it does not execute controls.
