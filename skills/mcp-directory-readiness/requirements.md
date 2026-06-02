# Anthropic MCP Directory — verified requirements

Sources:
- https://claude.com/docs/connectors/building/submission
- https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy
- Updated 2026-06-02 — reflects current policy (NOT the pre-2026 version)

## The 9 requirements (post-2026 policy)

### 1. Tool annotations — `title` AND a hint, on EVERY tool

Every tool must declare:
- `title` — human-readable label shown in Claude's UI (separate from the machine `name`)
- AND one of: `readOnlyHint: true` (search / get / list / fetch / diff / read) OR `destructiveHint: true` (create / update / delete / send / restore / revoke / cancel)

Tools that mutate but don't destroy may set BOTH hints to `false` — but `title` is still required.

**Missing annotations account for ~30% of directory rejections.**

### 2. OAuth 2.1 with PKCE S256 — for any authenticated server

Required:
- OAuth 2.1 (not 2.0)
- PKCE with S256 challenge method
- Authorization Code flow only — **no implicit grant**, **no client-credentials-only**
- Exact redirect-URI match (no wildcards)
- **REQUIRED redirect URIs allowlist** in your authorization server:
  - `https://claude.ai/api/mcp/auth_callback`
  - `https://claude.com/api/mcp/auth_callback`

Both URLs above must be allowlisted or the install flow fails on Claude's end.

Modern pattern (RFC 9728): your `WWW-Authenticate: Bearer` challenge should include `resource_metadata="https://your-domain/.well-known/oauth-protected-resource"`. The protected-resource metadata endpoint should return 200 with `resource`, `authorization_servers`, `scopes_supported`, `bearer_methods_supported`. The authorization-server metadata at `https://your-domain/.well-known/oauth-authorization-server` must return 200 with `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `code_challenge_methods_supported: ["S256"]`.

Unauthenticated read-only servers (e.g. public docs lookup) are exempt from OAuth.

### 3. HTTPS — all transport

Streamable HTTP over HTTPS, internet-accessible. No `http://` URLs in any production config. HSTS preload recommended.

### 4. Privacy policy — REQUIRED for ALL servers (corrected 2026-06)

Previous skill versions said "LOCAL only" — that was the pre-2026 policy. The current policy requires a privacy policy for **any server that handles user data or talks to a remote service**, which is effectively every directory-listable server.

You need:
- An HTTPS-hosted privacy policy URL (e.g. `https://your-domain/privacy`)
- A "Privacy Policy" section in your README pointing at that URL
- A `privacy_policies` array in your `manifest.json` (see #5)

### 5. `manifest.json` — REQUIRED at version 0.2+

The manifest defines submission metadata that the directory ingests automatically. Minimum:

```json
{
  "manifest_version": "0.2",
  "name": "<server-slug>",
  "version": "0.1.0",
  "description": "<one-line>",
  "homepage": "https://<server-or-docs-url>",
  "privacy_policies": ["https://<your-domain>/privacy"],
  "documentation": "https://<docs-url>"
}
```

`privacy_policies` is an array (multiple jurisdictions / languages allowed). All URLs must be HTTPS. `manifest_version` strings below `0.2` are rejected.

### 6. Submission packet — non-code assets

The submission form expects:
- **Logo** — URL or inline SVG, square aspect ratio
- **Favicon** — URL or inline ICO/PNG
- **Test account** — sample credentials + step-by-step setup so reviewers can exercise tools end-to-end
- **Three working example prompts** — concrete, copy-pasteable, each exercising 1-3 tools
- **Public documentation URL** — README on GitHub or hosted docs
- **Confirmation** that every advertised tool has been tested against a real backing system

Stub tools that return mock data will be caught and rejected.

### 7. `ui/open-link` capability — optional

If the server emits web links (dashboards, doc pages, ticket URLs), declare this capability so Claude can render them. Skip if the server doesn't open URLs.

### 8. Submission category routing

- **Remote MCP servers / MCP Apps** → https://clau.de/mcp-directory-submission
- **Desktop extensions** (.dxt files, manifest.json with `desktop-extension` type) → https://clau.de/desktop-extention-submission
- **Review-queue contact** (use if submission stalls >2 weeks): `mcp-review@anthropic.com`

### 9. Review window

Manual review, ~2 weeks turnaround. Plan submission timing accordingly — don't submit the same day a recruiter asks for the listing URL.

---

## Common rejection patterns (updated 2026-06)

1. **Missing tool annotations** — ~30% of rejections. `title` AND one hint, on every tool.
2. **Mixed annotation discipline** — some tools annotated, some not.
3. **OAuth misconfig** — implicit grant, missing PKCE, missing `claude.com` callback in allowlist.
4. **Stub tools** — reviewers will run a smoke test; mock data tells get caught.
5. **Missing manifest.json** or `manifest_version` < 0.2.
6. **Missing privacy policy** — no README section, or `privacy_policies` not in manifest.
7. **`http://` anywhere in production config**.
8. **Tool descriptions that don't match runtime behavior** — caught on review.
9. **Production URL returning 500** on the OAuth metadata endpoints — test before submitting.

## Pre-submission smoke tests (run before pasting into the form)

```bash
# 1. Bearer challenge present
curl -sI -X POST https://<your-mcp-url> | grep -i 'www-authenticate'

# 2. Protected-resource metadata
curl -s https://<your-domain>/.well-known/oauth-protected-resource | jq .

# 3. Authorization-server metadata
curl -s https://<your-domain>/.well-known/oauth-authorization-server | jq .

# 4. JWKS reachable
curl -s https://<your-domain>/.well-known/jwks | jq .

# 5. Privacy policy URL live
curl -sI https://<your-domain>/privacy | head -1

# 6. Every tool in tools/list has title + hint
# (use the skill's audit-checklist.md to inspect your source)
```
