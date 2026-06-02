# Smoketest Template

Layer 1 of the evidence-gated CI gate. Hard budget: **30 seconds end-to-end.** If it takes longer, it's not a smoketest, it's an e2e.

Three required probes. All three must pass or the build blocks. Don't add a fourth without removing one.

## Probe 1: HTTP healthcheck (body shape, not just 200)

The most common smoketest mistake is asserting status 200 only. Lots of broken systems return 200:
- A maintenance page
- A cached CDN response from before the outage
- A load-balancer "I see the host is up" response that didn't actually hit your app

Always assert **body shape** that proves the app — not the LB, not the CDN — answered.

### Bash (curl + jq)
```bash
body=$(curl -fsS --max-time 10 "$PROD_URL/health")
echo "$body" | jq -e '.status == "ok" and (.version | length > 0)' \
  || { echo "health body shape failed: $body"; exit 1; }
```

### Node
```ts
const res = await fetch(`${PROD_URL}/health`, { signal: AbortSignal.timeout(10_000) });
const body = await res.json();
if (body.status !== "ok" || !body.version) {
  throw new Error(`health body shape failed: ${JSON.stringify(body)}`);
}
```

### Python
```python
import httpx
r = httpx.get(f"{PROD_URL}/health", timeout=10.0)
r.raise_for_status()
body = r.json()
assert body.get("status") == "ok" and body.get("version"), f"bad health body: {body}"
```

### What `/health` should return

```json
{
  "status": "ok",
  "version": "abc123def",       // git SHA the app was built from
  "checks": {                    // optional per-dependency
    "db": "ok",
    "cache": "ok",
    "upstream_api": "ok"
  }
}
```

The version field is critical: it tells you which commit prod is actually running, which catches "deploy lied / rollback didn't happen" failures.

## Probe 2: DB connect + trivial read

Connecting is cheap; running one real read proves the credentials work, the network path works, and the schema isn't broken.

### Postgres
```bash
psql "$DATABASE_URL_READONLY" -c "SELECT 1" -t -A | grep -q "^1$"
```

### Supabase (via PostgREST)
```bash
curl -fsS \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/<a-public-table>?limit=1" \
  | jq -e 'length >= 0' > /dev/null
```

### SQLite (D1 / Cloudflare)
```bash
wrangler d1 execute $D1_NAME --command "SELECT 1" --remote | grep -q "1"
```

### MongoDB
```bash
mongosh "$MONGO_URL" --quiet --eval "db.runCommand({ping:1}).ok" | grep -q "^1$"
```

**Don't** read a row count that can be zero — read a known fixed row (e.g., a seeded `_smoketest_marker` row) so an empty table doesn't pass and a deleted marker fails loudly.

## Probe 3: Secret validity (upstream API probe)

A rotated upstream API key will sneak past Probes 1 and 2 and explode in Layer 2 e2e. Catch it cheaply here.

Hit the cheapest authenticated endpoint each upstream offers:

| Upstream | Cheap auth probe |
|---|---|
| OpenAI | `GET /v1/models` |
| Anthropic | `POST /v1/messages` with `max_tokens: 1` |
| Stripe | `GET /v1/balance` |
| GitHub | `GET /user` |
| Supabase service role | `GET /rest/v1/<table>?limit=0` |
| Twilio | `GET /2010-04-01/Accounts/{sid}.json` |
| SendGrid | `GET /v3/user/account` |
| YouTube | `GET /youtube/v3/channels?part=id&mine=true` |

```bash
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $UPSTREAM_API_KEY" \
  "https://api.upstream.example.com/v1/whoami")

case "$status" in
  401|403) echo "secret probe failed: $status (rotated/dead?)"; exit 1 ;;
  2*)      echo "secret ok" ;;
  *)       echo "secret probe ambiguous: $status"; exit 1 ;;
esac
```

## Time budget enforcement

Wrap the whole smoketest in a hard timeout. If it ever exceeds 30s, either prod is sick (fail loud) or the smoketest grew (cut it).

```bash
timeout 30 bash -c '
  ./bin/smoketest-http   &&
  ./bin/smoketest-db     &&
  ./bin/smoketest-secret
'
```

In GitHub Actions, set `timeout-minutes: 2` (cushion for runner cold start) and use `timeout` inside the step.

## What does NOT belong in a smoketest

- Anything that mutates state — that's e2e (Layer 2)
- Anything that takes >5s alone — split it out or move to e2e
- Anything flaky — flaky smoketests train people to ignore failures, which defeats the gate
- Synthetic monitoring loops — those run continuously, not on push; different tool
- "Eventually consistent" checks with retries — if it needs retries to pass, it doesn't belong in the <30s gate

## Local smoketest

Provide a `npm run smoketest` / `make smoketest` so devs can run it locally before pushing. Same script, just `PROD_URL=http://localhost:PORT`.
