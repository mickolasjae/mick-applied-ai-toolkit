# Telemetry — per-call schema + dashboard surfaces

The whole router is worthless if you can't see what each task type costs. One record per LLM call. One dashboard. Two charts that matter.

## Per-call log schema

Emit one record per `complete()` call, success or failure:

```json
{
  "request_id": "req_a1b2c3",
  "task_type": "vocab_extraction",
  "model_id": "claude-haiku-4-5",
  "provider": "anthropic",
  "input_tokens": 1842,
  "output_tokens": 217,
  "cost_usd": 0.002340,
  "latency_ms": 612,
  "status": "ok",
  "error_message": null,
  "timestamp_iso": "2026-06-15T14:23:11.412Z"
}
```

### Field rationale

| Field | Why it's required |
|---|---|
| `request_id` | Join key to upstream trace / user-facing request. Required to debug "this call was slow." |
| `task_type` | The routing dimension. All charts pivot on this. |
| `model_id` | The thing you'll change when re-eval-ing. Charts must show drift over time. |
| `provider` | Provider-level concentration / failure analysis. |
| `input_tokens` / `output_tokens` | Raw counts. Compute cost from them (don't trust pre-computed cost across version skews). |
| `cost_usd` | Pre-computed at call time using the price table the router knows about. Snapshot, not authoritative — for live dashboards. |
| `latency_ms` | p50 / p95 / p99 by task type. |
| `status` | `ok` or `error`. Error records have token counts = 0 but still log latency. |
| `error_message` | Free-form. Bucket later. |
| `timestamp_iso` | UTC, ISO 8601. Always. |

## Where to send the record

Pick one — any of these is fine, do not pick more than one:

- **Datadog** (`statsd`-style metrics + log events). Free up to volume; native histogram support.
- **Prometheus + Grafana** (push via Pushgateway or pull from app `/metrics`). Self-hosted control.
- **PostHog LLM Analytics** (native task-type / model breakdown). Lowest-effort if you're already on PostHog.
- **Custom: append-only JSONL to S3 → query in DuckDB/Athena**. Cheapest at scale, but you build the dashboard.

The router only needs one `sink(record)` callable. Don't fork the schema per backend; transform at the sink boundary.

## The two charts that matter

Mercor's verified surfaces are *rubric grading duration by media type* (video > audio > image > text) and *token usage per request*. Generalized for a multi-model router, the two charts you need on day one are:

### 1. Cost per call, broken down by `task_type`

X axis: time (last 7 / 30 days).
Y axis: USD per call (median + p95).
Series: one line per `task_type`.

What it tells you: which task types are quietly drifting up in cost. A prompt-length regression on `rag_synthesis` shows up here within hours.

### 2. Latency per call, broken down by `task_type`

X axis: time.
Y axis: latency (p50 / p95).
Series: one line per `task_type`.

What it tells you: which task types are hitting the long-tail of the underlying model. If `multimodal_reasoning` p95 jumps from 4s to 12s, that's a Gemini incident signal before the status page catches it.

## Useful supplementary charts (add when needed)

- **Cost by `provider`** — concentration risk dashboard. Catches "we're 92% on Anthropic" before a single-vendor outage takes you down.
- **Error rate by `task_type` × `model_id`** — surfaces silent-degradation when a provider rolls a new model snapshot.
- **Cost per unit-of-business-value** (cost per session, cost per active user, cost per resolved ticket) — the only number that matters for unit economics. Compute by joining `request_id` to the upstream session.

## Alerting

Two alerts, no more:

1. **Per-task cost regression** — cost-per-call for any `task_type` over the last hour > 1.5× the trailing 7-day median. Page yourself.
2. **Per-task error rate** — error rate for any `task_type` > 5% over the last 15 min. Page yourself.

Skip the noisy stuff (single-call failures, p99 latency on low-volume task types). Start narrow.

## Implementation notes

- **Telemetry must never break the call path.** Wrap the sink in try/except; swallow on failure. The router templates already do this.
- **Sample only as a last resort.** LLM call volume is rarely high enough to require sampling; logging every call costs less than one extra LLM call's worth of tokens per day.
- **Don't log message content by default.** Add an opt-in `include_messages: bool` flag for debug environments only. Production logs are not the place for user PII.
- **Snapshot the price table version.** If you ever re-cost historical records (e.g., a provider drops prices retroactively), you'll thank yourself. Add `price_table_version: "2026-06"` to the record if your prices change frequently.
