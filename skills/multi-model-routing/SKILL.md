---
name: multi-model-routing
description: "Use when wiring multiple LLM providers / models into one application and you want to pick the cheapest model per task type without hand-coding the routing. Generates a router with per-task-type model selection, per-call cost telemetry, and a dashboard-ready emit. Triggers on: 'route between Claude and GPT', 'cheapest model for X', 'multi-model dispatch', 'LLM cost telemetry', 'which model should I use for vocab extraction', 'reduce LLM bill'."
---

# Multi-Model Routing

Scaffold a cost-aware LLM router that picks the cheapest model that clears each task type's quality bar, then logs per-call cost so you can keep optimizing.

## 1. When to use this skill

Trigger any time the application has — or will soon have — more than one model in play and you want to stop hand-coding which one gets called where.

Phrases that should fire this skill:
- "route between Claude and GPT"
- "cheapest model for [task]"
- "multi-model dispatch"
- "LLM cost telemetry"
- "which model should I use for vocab extraction / classification / RAG / X"
- "reduce our LLM bill"
- "switch this call to a cheaper model"

This is the LLM analog of the "right tool for the job" rule. Do not use Opus to classify a string. Do not use Haiku to plan a 12-step agent run. The router enforces that discipline at the call site.

## 2. The task-taxonomy approach

The verified pattern (from Mercor's scoring module, README §5/9/10) is:

> "We choose the model based on the type of rubric item — not all items need the same LLM."

Concretely, they route:
- **Forms (text-only)** → `o4-mini` — cheap, fast, text-only
- **Interviews (video + audio + transcript)** → `gemini-2.5-flash` — multimodal capable

That's the whole idea, generalized:

1. **Enumerate the task types** in your application. Not endpoints, not services — *task types*. e.g. "classify intent", "extract vocab pairs", "synthesize RAG answer", "plan multi-step agent action", "transcribe voice memo", "reason over uploaded video".
2. **Map each task type to the cheapest model that clears its quality bar.** The quality bar is set by an eval — small offline test set, golden answers, percent-correct or rubric-score threshold.
3. **The router enforces the mapping at the call site.** Callers pass a `task_type` label, not a model name. The router resolves the model.

See `task-taxonomy.md` for a starter map across common task types with June 2026 pricing.

## 3. The cost-vs-quality eval loop

Models drop a tier in cost every ~6 months. Anchoring on a model name in code is anchoring on a snapshot.

Run this loop every quarter:
1. Pull the new model list from each provider (Anthropic, OpenAI, Google, Together, Fireworks).
2. For each task type, run the existing eval set against the new candidate models.
3. If a cheaper model clears the quality bar, update the task-type → model map in one place.
4. Roll forward. Telemetry will show the per-task cost drop on the dashboard within a day.

Frontier today → cheap tomorrow. Code the abstraction, not the model name.

## 4. Integration patterns

### 4a. Wrap each model in a uniform interface

One `LLMClient` interface; one method like `complete(messages, task_type, **kwargs) -> Response`. The wrapper hides provider-specific SDK shapes (Anthropic vs OpenAI vs Google) behind a common request/response.

### 4b. Route by task-type label passed by the caller

The caller never picks the model. The caller passes `task_type="vocab_extraction"` and the router looks up the registered model.

```python
# Good
client.complete(messages, task_type="vocab_extraction")

# Bad — call site shouldn't know the model
client.complete(messages, model="claude-haiku-4-5")
```

This is the *one* knob you turn to re-route a whole class of calls.

### 4c. Emit telemetry to a single dashboard

Every call emits one record: `{request_id, task_type, model_id, input_tokens, output_tokens, cost_usd, latency_ms, status}`. See `telemetry-template.md`.

Per Mercor's dashboard: the most useful surfaces are *rubric grading duration* broken down by media type (video > audio > image > text) and *token usage per request*. Generalize that to: latency-by-task-type and cost-by-task-type. Those two charts tell you where to optimize next.

## 5. Anti-patterns

### DO NOT route by request-cost-budget

> "If estimated cost < $0.01, use Haiku, else use Sonnet."

This is user-experience-blind. A short prompt for an agent-planning task still needs the planning-capable model — the prompt being short doesn't make the task easy. Route by *task type*, gate cost via the model you picked *for that task type*.

### DO NOT route by model availability (fallback chain)

> "Try Sonnet, on 429 fall back to Haiku."

This silently degrades quality. The caller asked for a planning result; they get a worse planning result and never know. For rate-limit / overload resilience, use the `anthropic-api-resilience` skill (retries, key rotation, circuit breakers) — not the router.

### DO NOT let callers pass `model=` directly

The whole point of the abstraction is one place to change the mapping. The moment a single call site bypasses the router with `model="gpt-5"`, you've lost the per-quarter eval loop for that call.

### DO NOT skip the eval before rerouting

Switching a task type from Sonnet to Haiku to save 10x cost is great — *if Haiku still clears the bar*. Always re-run the eval set first. The map only moves on evidence.

## 6. Files in this skill

- `router-template.ts` — TypeScript router implementation (drop-in)
- `router-template.py` — Python router implementation (drop-in)
- `task-taxonomy.md` — task-type → model map with June 2026 pricing
- `telemetry-template.md` — per-call log schema + dashboard surfaces

## 7. Highest-leverage projects

Highest leverage for projects that already have multiple task types and a recurring per-user cost — i.e., LinguaMind (vocab extraction + RAG synthesis + voice transcription + agent planning, all on the per-learner hot path).
