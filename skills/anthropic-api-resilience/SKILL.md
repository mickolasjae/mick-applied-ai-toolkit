---
name: anthropic-api-resilience
description: "Use when adding rate-limit / overload resilience to any Anthropic SDK client (Claude API consumer). Generates round-robin key rotation + exponential backoff (1s→5min, 2x multiplier) + circuit breaker (10 consecutive failures). Triggers on: 'Anthropic API rate limit', 'Claude API retries', 'multiple Anthropic keys', 'round-robin Anthropic', 'production-grade Anthropic client', 'rate limit error 429', 'Anthropic overloaded_error'."
---

# Anthropic API Resilience

Production-grade reliability wrapper for any `@anthropic-ai/sdk` (TS) or `anthropic` (Python) client. Adds three layers: **round-robin key rotation**, **exponential backoff**, and a **circuit breaker** on per-key failure streaks.

## When to use

Trigger this skill whenever the user is:
- Hitting `429 RateLimitError` or `529 overloaded_error` from Claude
- Asking for "Anthropic API retries", "multiple Anthropic keys", "round-robin Anthropic", "production-grade Anthropic client"
- Running an agent loop, batch job, or any long-running pipeline that calls `client.messages.create()` more than ~1/sec
- Reviewing code that calls Anthropic with no retry/backoff wrapper

Do **not** trigger for: simple one-shot scripts, prompt-engineering questions, or non-Anthropic providers.

## Quick assessment (ask this first)

> **How many Anthropic API keys do you have available?**

- **1 key**: round-robin buys nothing. Install the wrapper anyway — backoff + circuit breaker still prevent thundering-herd retries that get you rate-limited harder. Skip the multi-key env-var step.
- **2+ keys**: full payoff. Distinct keys from different Anthropic accounts/orgs give independent rate-limit buckets. Same-account keys share the bucket and only help with key-specific failures (revoked, network, etc.).

## Spec (verified pattern)

Sourced from `RL-Studio-Anthropic/ANTHROPIC_KEY_MANAGEMENT.md`:

| Knob | Value |
|---|---|
| Base backoff | 1 second |
| Max backoff | 5 minutes (300s) |
| Multiplier | 2.0x per consecutive failure |
| Circuit-break threshold | 10 consecutive failures |
| Circuit recovery | First success resets state |
| Key discovery | `ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEY_2`, `ANTHROPIC_API_KEY_3`, … |
| Start-key | Randomized (avoid thundering herd on cold start) |

### Key-selection algorithm

```
1. Start at current round-robin index
2. Skip keys in backoff window or circuit-broken
3. If all keys unhealthy → use the least backed-off one (graceful degradation)
4. On success: reset that key's failure counter to 0, clear backoff
5. On failure: increment failures, set backoff = min(base * 2^failures, max)
```

### What to retry

Retry on these — they are transient:
- `RateLimitError` (429)
- `APIConnectionError` (network)
- `InternalServerError` (5xx)
- `overloaded_error` (529)

Do **not** retry on `BadRequestError`, `AuthenticationError`, `PermissionDeniedError`, `NotFoundError`, or any other 4xx that isn't 429. These are deterministic — retrying just burns quota and produces the same error.

## Integration steps

1. **Pick the template** for the user's language:
   - TypeScript / Node: `typescript-template.ts`
   - Python: `python-template.py`
2. **Copy into the project** under `src/lib/anthropic/` (TS) or `src/anthropic/` (Py). Keep the filename meaningful: `resilient_client.ts` / `resilient_client.py`.
3. **Wire env vars**: add `ANTHROPIC_API_KEY_2`, `ANTHROPIC_API_KEY_3`, … to `.env`, `docker-compose.yml`, deployment task definitions. Single-key setups skip this.
4. **Swap the import** at every call site:
   ```ts
   // before
   import Anthropic from "@anthropic-ai/sdk";
   const client = new Anthropic();
   // after
   import { ResilientAnthropicClient } from "./lib/anthropic/resilient_client";
   const client = new ResilientAnthropicClient();
   ```
   Keep the same `client.messages.create(...)` call shape — the wrapper is interface-compatible.
5. **Expose health snapshot** for observability. Add a `/health/anthropic` route (or equivalent) that returns `client.getKeyStats()`. Alert when `healthy_keys < total_keys`.
6. **Verify**: run a load test or wait for a real 429. Confirm logs show `backing off for Ns` and `Selected ANTHROPIC_API_KEY_N for next request`.

See `integration-guide.md` for project-specific wiring (LinguaMind, mcp-butterfly, Butterfly Security).

## Anti-patterns

- **Don't retry on `BadRequestError`** or other deterministic 4xx — it's a code bug, not a transient failure. The template explicitly excludes these.
- **Don't bypass the wrapper** for "fast paths". Once installed, all Anthropic traffic should go through it so the per-key stats are accurate.
- **Don't share one key across many processes** without backoff — concurrent requests amplify rate limits. The wrapper's backoff is per-process; for multi-process fleets add a shared Redis-backed limiter.
- **Don't set max backoff < 60s** — Anthropic rate-limit windows are minute-scale. Sub-minute caps just produce retry storms.
- **Don't forget to remove explicit `apiKey: process.env.ANTHROPIC_API_KEY` overrides** at call sites — they bypass the manager.

## Files in this skill

- `SKILL.md` — this file
- `typescript-template.ts` — `ResilientAnthropicClient` for `@anthropic-ai/sdk`
- `python-template.py` — `ResilientAnthropicClient` for `anthropic`
- `integration-guide.md` — project-specific wiring recipes
