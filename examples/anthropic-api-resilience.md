# Example: `anthropic-api-resilience`

## Scenario

A nightly batch job that calls `client.messages.create()` ~50 times/sec has been silently dropping requests during Anthropic rate-limit windows. You have three API keys available and want round-robin rotation, exponential backoff, and a circuit breaker — without hand-rolling it.

## Trigger prompt

> Our LinguaMind batch worker keeps hitting `429 RateLimitError` overnight. I have three Anthropic keys in `ANTHROPIC_API_KEY_1/2/3`. Make it production-grade.

## Expected agent behavior

1. Loads the `anthropic-api-resilience` skill (matched on "429", "RateLimitError", "production-grade", "multiple keys").
2. Detects the SDK in use (TypeScript `@anthropic-ai/sdk` vs Python `anthropic`) and picks the matching template from `skills/anthropic-api-resilience/`.
3. Generates a `ResilientAnthropicClient` wrapper that:
   - Round-robins across the configured keys
   - Retries on `429` / `529` / network errors with backoff: **1s → 2s → 4s → ... → 5min** (2x multiplier, jitter)
   - Trips a **circuit breaker** on a key after 10 consecutive failures and rotates to the next
   - Logs every retry + breaker trip with the original key index (never the secret)
4. Wires it into the existing call sites and adds a smoketest that injects a fake 429.

## Expected output snippet

```ts
// anthropic-client.ts (generated)
export const claude = new ResilientAnthropicClient({
  keys: [process.env.ANTHROPIC_API_KEY_1!, process.env.ANTHROPIC_API_KEY_2!, process.env.ANTHROPIC_API_KEY_3!],
  backoff: { initialMs: 1_000, maxMs: 300_000, multiplier: 2, jitter: true },
  circuitBreaker: { consecutiveFailureThreshold: 10 },
});

// Drop-in replacement — same .messages.create() surface as the SDK.
const res = await claude.messages.create({ model: "claude-opus-4-7", ... });
```
