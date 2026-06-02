# Integration Guide

Project-specific recipes for wiring `ResilientAnthropicClient` into existing codebases. Each section is self-contained — jump to the project you're working on.

## Generic steps (any project)

1. Copy the language-appropriate template into `src/lib/anthropic/resilient_client.{ts,py}`.
2. Find every `new Anthropic(...)` (TS) or `Anthropic(...)` (Py) construction. Replace with `new ResilientAnthropicClient(...)` / `ResilientAnthropicClient(...)`.
3. Remove explicit `apiKey: process.env.ANTHROPIC_API_KEY` overrides — they bypass the rotation manager.
4. Add `ANTHROPIC_API_KEY_2`, `ANTHROPIC_API_KEY_3`, … to:
   - `.env` / `.env.example`
   - `docker-compose.yml` env block
   - Kubernetes secret / ConfigMap
   - Cloud deployment task definition (AWS ECS, Cloud Run env vars, etc.)
5. Expose a `/health/anthropic` route that returns `client.getKeyStats()` (TS) or `client.get_key_stats()` (Py).
6. Wire monitoring: alert when `healthy_keys < total_keys` or when `status != "healthy"` for more than 5 minutes.

---

## Recipe: LinguaMind

LinguaMind is a Next.js / TypeScript project. Most Anthropic calls live in API route handlers and server actions.

1. Place template at `src/lib/anthropic/resilient_client.ts`.
2. Create a singleton accessor so health endpoints share stats with route handlers:
   ```ts
   // src/lib/anthropic/index.ts
   import { ResilientAnthropicClient } from "./resilient_client";
   let _client: ResilientAnthropicClient | null = null;
   export function getAnthropic(): ResilientAnthropicClient {
     if (!_client) _client = new ResilientAnthropicClient();
     return _client;
   }
   ```
3. Replace every `new Anthropic()` in `src/app/api/**` and `src/server/**` with `getAnthropic()`.
4. Add a health route:
   ```ts
   // src/app/api/health/anthropic/route.ts
   import { NextResponse } from "next/server";
   import { getAnthropic } from "@/lib/anthropic";
   export async function GET() {
     return NextResponse.json(getAnthropic().getKeyStats());
   }
   ```
5. Update `.env.example` with `ANTHROPIC_API_KEY_2=` (and `_3` if applicable).
6. In Vercel project settings, add the additional keys as encrypted env vars.

---

## Recipe: mcp-butterfly

mcp-butterfly is a Python MCP server using the `anthropic` SDK for tool-augmented loops.

1. Place template at `mcp_butterfly/anthropic/resilient_client.py`.
2. Replace the module-level `Anthropic()` instantiation in the MCP server bootstrap with `ResilientAnthropicClient()`.
3. Because MCP tools run inside a long-lived async event loop, the synchronous `time.sleep()` in the wrapper can stall the loop. **Either**:
   - Wrap calls in `asyncio.to_thread(client.messages.create, ...)`, **or**
   - Port the wrapper to use `asyncio.sleep` + `AsyncAnthropic` (recommended for high-QPS servers).
4. Add a `tools/anthropic_health` MCP tool that returns `client.get_key_stats()` — handy for live debugging from the client.
5. Update `docker-compose.yml` with `ANTHROPIC_API_KEY_2`.

---

## Recipe: Butterfly Security

Butterfly Security runs scheduled red-team agent loops that hammer Claude — the highest-priority candidate for this wrapper.

1. Place template at `butterfly/llm/resilient_client.py`.
2. Replace the `Anthropic()` constructor in `butterfly/llm/agent.py`.
3. **Critical**: red-team loops often run in parallel across workers. The wrapper's backoff is per-process. To prevent all workers from hammering the same key simultaneously:
   - Stagger worker start (already done via randomized start key — verify).
   - Add a shared Redis-backed token bucket in front of the wrapper for fleets > 5 workers. The wrapper still handles per-key health and circuit breaking; Redis handles cross-process pacing.
4. Pipe `client.get_key_stats()` into the existing Prometheus exporter. Add an alert: `anthropic_healthy_keys < anthropic_total_keys` for > 5m.
5. In the Terraform module, add `ANTHROPIC_API_KEY_2` as a secret-manager-backed env var on the ECS task definition.

---

## Verification checklist

After integration, verify:
- [ ] Health endpoint returns `status: "healthy"` and `total_keys` matches expected count.
- [ ] Logs show alternating key names across requests (round-robin is working).
- [ ] Forcing a fake 429 (point one key at an invalid URL or use an invalid key) shows the wrapper backing off that key and routing to others.
- [ ] After 10 consecutive forced failures, the bad key is `circuit_broken: true` and stops being selected.
- [ ] Calling `client.resetAll()` / `client.reset_all()` clears circuit-broken state.
- [ ] No call sites still construct a raw `Anthropic()` client (grep for it).

## Common failure modes after install

| Symptom | Cause | Fix |
|---|---|---|
| Still hitting 429s | All keys share one Anthropic org / billing account → shared rate-limit bucket | Use keys from separate orgs, or front the wrapper with a token-bucket limiter |
| `healthy_keys: 0` immediately | All keys invalid/revoked | Check secret manager values; `client.resetAll()` after fixing |
| Backoff never recovers | Circuit broken and traffic is too low to test recovery | Drop `CIRCUIT_BREAKER_THRESHOLD` lower or add a periodic `resetAll()` cron |
| Async server stalls | Sync `time.sleep` in Python template inside an async loop | Switch to `AsyncAnthropic` + `asyncio.sleep` port |
