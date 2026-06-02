# Audit checklist — concrete checks

Run these in order. Stop at first blocker only if user requests; otherwise collect all gaps in one pass.

## Pre-step: identify tool registration

```bash
# Find where tools are registered. Common patterns:
rg -n "server\.tool\(|registerTool\(|tools:\s*\[|case \"tools/list\"" --type ts --type js
# Or for Python:
rg -n "@server\.list_tools|@tool\(|Tool\(" --type py
```

Note the file + line range of the tool list. Everything below operates on that block.

## Check 1: OAuth 2.0 (skip if unauthenticated server)

```bash
# Look for OAuth metadata endpoint
rg -n "well-known/oauth-authorization-server|/authorize|/token" 
# Look for OAuth config
rg -n "OAUTH|oauthProvider|authMiddleware"
```

- If server touches user data and has no OAuth → **P0 blocker**. TODO for user.
- If server is read-only public data → mark N/A.

## Check 2: `title` on every tool

```bash
# Count tools vs count of title fields in tool registration block
rg -n "name:\s*[\"']" <tool-file>     # count tools
rg -n "title:\s*[\"']" <tool-file>    # count titles
```

For each tool missing `title`:
- **Auto-fix**: propose human-readable title from the `name` (snake_case → Title Case). e.g. `restore_session` → `"Restore Session"`.

## Check 3: `readOnlyHint` OR `destructiveHint` on every tool

```bash
rg -n "readOnlyHint|destructiveHint" <tool-file>
```

For each tool missing both hints:
- If tool name starts with `list_`, `get_`, `read_`, `search_`, `diff_`, `find_` → **auto-fix**: add `readOnlyHint: true`
- If tool name starts with `create_`, `update_`, `delete_`, `restore_`, `revoke_`, `send_`, `cancel_` → **auto-fix**: add `destructiveHint: true`
- Ambiguous → **TODO** for user

## Check 4: HTTPS everywhere

```bash
rg -n "http://" --type ts --type js --type json --type py | rg -v "localhost|127\.0\.0\.1|example\.com|schema"
```

Any production `http://` → **P0 blocker**, auto-fix to `https://`.

## Check 5: Privacy policy — REQUIRED for ALL servers (corrected 2026-06)

The pre-2026 policy said "LOCAL only" — that's stale. Current policy requires a privacy policy for any server that handles user data or talks to a remote service (which is essentially all directory submissions).

```bash
# README section
rg -n -i "^##.*privacy" README.md

# Hosted policy URL
curl -sI https://<your-domain>/privacy | head -1

# manifest.json's privacy_policies array
jq -r '.privacy_policies // empty' manifest.json 2>/dev/null
```

Block list if ANY of these are missing:
- HTTPS-hosted privacy policy URL returning 200
- "Privacy Policy" section in README pointing at that URL
- `privacy_policies` array in manifest.json (≥1 HTTPS URL)

For a Cloudflare/Vercel/Fly remote server pointing at `https://<your-domain>/privacy`, the autofix is the same as the local case — add the section + manifest field. The URL itself doesn't need to be served from the same host as the MCP endpoint.

## Check 6: `ui/open-link` capability (optional)

```bash
rg -n "ui/open-link|openLink|capabilities" 
```

Only relevant if server returns URLs in tool responses. Surface as a P2 note.

## Check 6.5: manifest.json present at v0.2+ (REQUIRED — corrected 2026-06)

```bash
# Manifest must exist with manifest_version 0.2 or later
jq -r '.manifest_version' manifest.json 2>/dev/null
```

Minimum schema:

```json
{
  "manifest_version": "0.2",
  "name": "<server-slug>",
  "version": "0.1.0",
  "description": "<one line>",
  "homepage": "https://<server-or-docs-url>",
  "privacy_policies": ["https://<your-domain>/privacy"],
  "documentation": "https://<docs-url>"
}
```

Missing manifest.json OR `manifest_version` < 0.2 → **P0 blocker**, auto-fix with the template above.

## Check 6.6: OAuth 2.1 + claude.com callback allowlist (REQUIRED for authenticated)

```bash
# Both callbacks must be allowlisted in your OAuth provider's redirect_uris
# claude.ai and claude.com both call back
```

Required allowlist (cannot be substituted):
- `https://claude.ai/api/mcp/auth_callback`
- `https://claude.com/api/mcp/auth_callback`

Implicit grant must NOT be advertised in `grant_types_supported`. PKCE S256 must be in `code_challenge_methods_supported`.

## Check 6.7: Tools actually wired (REQUIRED — no stubs)

```bash
# Smoke-test each tool against its backing system. If your README says
# "v0.X scaffold, N tools stubbed" — STOP. Reviewers will catch this.
```

Block list if any tool is documented as a stub or returns mock data.

## Check 7: Submission routing

Determine category from transport:
- Remote streamable-HTTP → https://clau.de/mcp-directory-submission
- Desktop extension → https://clau.de/desktop-extention-submission

Surface the right URL in the final output.

## Final pass: smoke-test the production URL

If remote: `curl -sI <prod-url>/.well-known/oauth-authorization-server` — expect 200 + valid JSON. If fails → **P0 blocker**.
