---
name: evidence-gated-ci
description: "Use when adding CI gates to a new project that touches production state or external services. Scaffolds smoketest + e2e + artifact-verified-mutation discipline so no claim of state change ships without an HTTP response body / bridge ack on disk. Triggers on: 'add CI to this project', 'evidence-gated CI', 'pre-push gate', 'smoketest setup', 'how do I make sure my agent isn't lying about external mutations', 'artifact-verified'."
---

# Evidence-Gated CI

Codifies the CI discipline Mick Johnson runs across Tandem, Butterfly Security, LinguaMind, and mcp-butterfly: **no claim of an external state change ships without an artifact on disk proving it happened.** No green tests on assumptions, no "it should work."

## When to use

Trigger this skill when:
- Adding CI to a new project that touches prod state (DBs, third-party APIs, devices, social platforms)
- The user says: "evidence-gated CI", "pre-push gate", "smoketest setup", "artifact-verified", "make sure the agent isn't lying about mutations"
- An agent-driven workflow needs to prove it did something external (posted a comment, revoked a key, flipped a flag) — not just claim it
- Migrating a project from `npm test` only -> real production-touching CI

## The three layers of the gate

Run them in this order. Each layer has a hard time budget and a hard pass/fail. No "flaky, retry."

### Layer 1: Smoketest (<30s, every push)

The "is the lights-on" test. Always runs first; if it fails, skip Layer 2 + 3 to save minutes.

Required checks:
- HTTP healthcheck on production URL (assert 200 + expected body shape, not just 200)
- DB connect + 1 trivial read (e.g., `SELECT 1` or known-row read)
- Secret validity probe (call the upstream API with the secret, assert non-401)
- Build hash echo (so you know which commit is actually deployed)

Fail = block merge. No retries on Layer 1; flakes here mean prod is sick or the secret rotated.

See `smoketest-template.md` for scaffolding.

### Layer 2: e2e (2-10 min, every push to main / before merge)

Real product flows against prod (or a staging mirror that mirrors prod's data shape and secrets).

Pattern:
- Playwright for web
- Detox / XCUITest for iOS
- pytest + httpx for server APIs
- Each test seeds a deterministic test-tenant, runs the flow, asserts the artifact, cleans up

The reference number Mick cites in cover letters is "81-step e2e against prod" (LinguaMind). What that means in practice: every user-facing action — sign-in, lesson start, audio segment fetch, RLS-protected read, payment webhook — has a step. Don't compress these into "one happy path test"; the value is each step asserts an artifact.

Fail = block merge. Retries OK at the suite level (not individual flaky tests) because prod is genuinely noisy.

### Layer 3: Artifact-verified mutations (the load-bearing layer)

The discipline that makes the other two trustworthy.

**Rule**: every time the codebase (or an agent acting on its behalf) claims an external mutation happened, CI verifies an artifact file exists under `artifacts/<run-id>/` with the captured response from the external system.

What "artifact" means in this skill — per external-system type, see `artifact-discipline.md`. Examples:
- YouTube comment posted -> `artifacts/<run-id>/youtube-comment-<videoId>.json` containing the YouTube API response with the new comment ID
- Devpost field updated -> `artifacts/<run-id>/devpost-field-<slug>.html` containing the post-write GET showing the new value
- API key revoked -> `artifacts/<run-id>/revoke-<keyId>.json` with the provider's revoke confirmation + a follow-up 401 from the dead key
- Video privacy flipped -> two artifacts: pre-state + post-state from the platform's read API
- MCP bridge call (mcp-butterfly pattern) -> `artifacts/<run-id>/bridge-ack-<requestId>.json` containing the bridge's signed ack

The CI step that gates this:

```bash
# pseudocode: fail the build if mutation-claim count != artifact count
claimed=$(grep -c "MUTATION_CLAIM" build.log)
verified=$(ls artifacts/$RUN_ID/ | wc -l)
if [ "$claimed" -ne "$verified" ]; then
  echo "Mutation-claim/artifact mismatch: $claimed claimed, $verified verified"
  exit 1
fi
```

Mutations are logged with a sentinel (`MUTATION_CLAIM: <kind> <id>`) at the call site. The artifact writer is the only thing allowed to "confirm" the claim. No artifact, no green build.

Fail = block deploy. This is the layer that stops a hallucinating agent from shipping a "posted the comment!" PR when no comment exists.

## Per-platform install

Pick the row matching your stack; the template files do the rest.

| Stack | CI runner | Smoketest | e2e | Artifact store |
|---|---|---|---|---|
| Next.js + Cloudflare Workers | GitHub Actions (template included) | `curl` + `wrangler tail` | Playwright headless | Actions `upload-artifact` |
| SwiftUI + App Store | Xcode Cloud or GitHub Actions w/ macos runner | `curl` healthcheck on backend | XCUITest on simulator | Actions `upload-artifact` |
| Python + Fly.io | GitHub Actions | `flyctl status` + `httpx` probe | `pytest -m e2e` | Actions `upload-artifact` |
| Node MCP server | GitHub Actions | `npm run smoketest` (HTTP probe) | `pytest mcp-evals/` | Actions `upload-artifact` + commit to repo on main |

Drop-in workflow: see `github-actions-template.yml`.

## Anti-patterns

**Don't run mutation-heavy e2e against prod without a test-tenant.** If your e2e creates real users, posts real comments, or charges real cards, you'll leak state into prod metrics, into customer-visible queues, into billing reconciliation. Use one of:
- A test-tenant (a real prod account flagged `is_test=true`, filtered out of analytics + billing)
- A rollback hook that runs in `finally` and undoes any mutation the test made
- A staging mirror with periodic prod-data refresh

**Don't let Layer 3 become advisory.** The whole point is that mutation claims without artifacts fail the build. If "fail the build" becomes "warn in logs," within two weeks the agent is back to lying and you won't notice.

**Don't accept stdout strings as artifacts.** An artifact must be a captured response from the external system — JSON body, HTML body, signed ack, screenshot from a follow-up read. "The agent said it worked" is not an artifact.

**Don't skip Layer 1 because Layer 2 is more thorough.** Layer 1 catches "prod is down" / "secret rotated" / "DB migration broke" cheaply. Without it, you burn 10 minutes on Layer 2 to discover prod returned 503.

## Files in this skill

- `SKILL.md` — this file
- `github-actions-template.yml` — drop-in GH Actions workflow with all three layers wired
- `smoketest-template.md` — generic smoketest scaffolding (HTTP, DB, secret)
- `artifact-discipline.md` — concrete "what counts as an artifact" examples per external system

## Highest-leverage class of bug this prevents

**Agent-fabricated state changes that pass review because the test suite never asked the external system whether the change actually happened.** Layer 3 makes that bug structurally impossible to ship.
