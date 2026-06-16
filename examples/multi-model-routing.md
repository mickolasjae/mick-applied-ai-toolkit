# Example: `multi-model-routing`

## Scenario

LinguaMind has two LLM workloads: **vocab extraction** (cheap, high-volume, tolerates a small model) and **RAG synthesis for tutor replies** (latency-sensitive, needs a frontier model). Hand-coding the model choice at every call site is getting messy, and you have no idea what each task type actually costs per day.

## Trigger prompt

> I'm calling both Claude and GPT from this app. Vocab extraction should go to the cheapest model that works, tutor replies need the best. Set up routing with per-call cost telemetry so I can see where the bill goes.

## Expected agent behavior

1. Loads the `multi-model-routing` skill (matched on "route between Claude and GPT", "cheapest model", "cost telemetry").
2. Reads `skills/multi-model-routing/task-taxonomy.md` to classify the two workloads.
3. Generates a `Router` with:
   - Per-task-type model selection (vocab-extraction → Haiku, tutor-reply → Opus 4.7)
   - A single `router.run({ taskType, prompt })` entry point so call sites stop naming models
   - Per-call telemetry emit: `{ taskType, model, inputTokens, outputTokens, costUsd, latencyMs }`
   - A dashboard-ready JSONL log at `logs/llm-cost.jsonl` (PostHog / Datadog ingestible)
4. Refactors existing call sites to go through the router.

## Expected output snippet

```python
# router.py (generated)
router = Router(
    routes={
        "vocab-extraction": ModelChoice(provider="anthropic", model="claude-haiku-4-5"),
        "tutor-reply":      ModelChoice(provider="anthropic", model="claude-opus-4-7"),
        "fallback":         ModelChoice(provider="openai",    model="gpt-4o-mini"),
    },
    telemetry_sink=JsonlSink("logs/llm-cost.jsonl"),
)

# call sites
words = router.run(task_type="vocab-extraction", prompt=lesson_text)
reply = router.run(task_type="tutor-reply", prompt=student_question)
```

After a day of traffic, `logs/llm-cost.jsonl` aggregates to a per-task-type cost breakdown so you can see exactly which workload to optimize next.
