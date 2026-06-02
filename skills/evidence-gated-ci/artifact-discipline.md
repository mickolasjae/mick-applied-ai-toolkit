# Artifact Discipline

The rule: **every claim of an external state change must be backed by a file on disk containing a response from the external system.** Not from your own code. Not from the agent. From the system you mutated.

If the build can't find that file, the build fails.

## What counts as an artifact

An artifact must be:
1. **Produced by the external system**, not by your code (response body, signed ack, post-mutation read of platform state)
2. **Non-empty** and **schema-valid** (has the field that proves the mutation — comment id, etag, new value)
3. **Written to `artifacts/<run-id>/<deterministic-name>.{json,html,png}`** before the mutation log line is emitted

What does NOT count:
- `{"ok": true}` written by your own code
- `console.log("posted comment")` lines
- The 2xx status code alone (lots of 200s come back from "we noticed your request" endpoints that didn't actually mutate)
- Screenshots of your own UI claiming success

## Mutation-claim sentinel

At every mutation call site, emit one line in this format **after** the artifact is written:

```
MUTATION_CLAIM: <kind> <external-id> artifact=<path>
```

Example:
```
MUTATION_CLAIM: youtube.comment.create UgxK_abc123 artifact=artifacts/run-42/youtube-comment-UgxK_abc123.json
```

The verify-mutations CI step (see `github-actions-template.yml`) greps these lines and checks the artifact paths exist + are non-empty + pass schema check.

## Per-system playbook

### YouTube comment posted
- **Artifact**: full YouTube Data API v3 `comments.insert` response body
- **Path**: `artifacts/<run-id>/youtube-comment-<videoId>-<commentId>.json`
- **Schema check**: has `id`, `snippet.textDisplay` matches the text the agent claims it posted
- **Optional second artifact**: a follow-up `comments.list?parentId=...` showing the comment in the thread (catches the "API said 200 but moderation hid it" failure mode)

### Devpost (or any HTML form) field updated
- **Artifact**: the post-PUT GET response HTML for the project page, captured to `artifacts/<run-id>/devpost-<slug>.html`
- **Schema check**: grep -F the expected new value out of the HTML; fail if absent
- **Why HTML, not the PUT response**: Devpost's PUT often returns 200 even when validation silently rejects the change. The only ground truth is a fresh GET.

### API key revocation
- **Two artifacts required** (you must prove the key is dead, not just claim it):
  1. `artifacts/<run-id>/revoke-<keyId>.json` — provider's revoke endpoint response
  2. `artifacts/<run-id>/revoke-<keyId>-verify.json` — a follow-up authenticated call with the revoked key, expecting 401/403, response captured
- **Schema check**: artifact 2's status field is in `{401, 403}` and body contains a revocation reason string

### Social media post (X / Bluesky / LinkedIn)
- **Artifact**: API response containing the new post's permanent URL or ID
- **Path**: `artifacts/<run-id>/<platform>-post-<id>.json`
- **Schema check**: `id` field present; `text` field matches what was posted
- **Optional**: a follow-up GET of the post URL, captured as HTML, to catch shadowbans / silent-deletes

### YouTube / Vimeo video privacy flipped
- **Two artifacts** (pre + post state from the platform's own read API):
  1. `artifacts/<run-id>/video-<id>-before.json` — `videos.list` showing old privacy
  2. `artifacts/<run-id>/video-<id>-after.json` — `videos.list` showing new privacy
- **Schema check**: `status.privacyStatus` differs between the two

### MCP bridge call (mcp-butterfly pattern)
- **Artifact**: the bridge's signed ack — `{requestId, signature, timestamp, result}` — written by the bridge, not by the caller
- **Path**: `artifacts/<run-id>/bridge-ack-<requestId>.json`
- **Schema check**: signature verifies against the bridge's public key; `requestId` matches the caller's outbound request
- **Why this matters**: the whole point of the bridge architecture is that the caller cannot forge the ack — the signature is the proof

### Database mutation (Postgres / Supabase)
- **Artifact**: a post-write `SELECT` showing the row's new state, captured as JSON
- **Path**: `artifacts/<run-id>/db-<table>-<pk>.json`
- **Schema check**: the field the mutation claimed to change is in the post-state
- **Don't use the INSERT/UPDATE rowcount alone** — triggers, RLS, or upsert-on-conflict can return rowcount=1 with no actual change

### Email / SMS sent (Resend, Twilio, SendGrid)
- **Artifact**: provider response containing the platform's message id + delivery state (`queued` / `sent` / `delivered`)
- **Path**: `artifacts/<run-id>/<provider>-msg-<id>.json`
- **Schema check**: `id` present; status not in `{failed, undelivered, bounced}`
- **Stronger version**: webhook callback artifact showing final delivery state

### File upload (S3, R2, Drive)
- **Artifact**: a post-upload HEAD/GET showing the object exists with the expected etag/size
- **Path**: `artifacts/<run-id>/upload-<bucket>-<key>.json`
- **Schema check**: `etag` and `size` match what the uploader computed locally

### App Store / TestFlight upload
- **Artifact**: App Store Connect API response with the build ID + processing state
- **Path**: `artifacts/<run-id>/asc-build-<buildId>.json`
- **Schema check**: `processingState` is one of `{PROCESSING, VALID}` (not `INVALID` or `FAILED`)
- **Follow-up**: a second artifact 10 min later showing `processingState=VALID` once Apple finishes processing

## How to wire the writer

Centralize artifact writing in one helper so the rule can't be bypassed:

```ts
// artifacts.ts
import fs from "node:fs";
import path from "node:path";

const ART_DIR = process.env.ARTIFACT_DIR || `artifacts/${process.env.RUN_ID || "local"}`;
fs.mkdirSync(ART_DIR, { recursive: true });

export function recordMutation(
  kind: string,
  externalId: string,
  proof: object | string,
): void {
  const ext = typeof proof === "string" ? "html" : "json";
  const file = path.join(ART_DIR, `${kind.replace(/\./g, "-")}-${externalId}.${ext}`);
  fs.writeFileSync(file, typeof proof === "string" ? proof : JSON.stringify(proof, null, 2));
  // Emit AFTER the file is written; CI greps for this line.
  console.log(`MUTATION_CLAIM: ${kind} ${externalId} artifact=${file}`);
}
```

Then the only way to claim a mutation in your codebase is to call `recordMutation()` with a real response. Reviewers can grep for `MUTATION_CLAIM` in PR diffs to see what the PR claims it did.
