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

## Check 5: Privacy policy (LOCAL only)

Determine transport:
- `package.json` has `"bin"` field + stdio transport → LOCAL → privacy policy required
- Cloudflare Workers / Vercel / Fly / Express on HTTPS → REMOTE → skip
- Desktop extension (`.dxt` file or `manifest.json` with `desktop-extension`) → LOCAL → privacy policy required

If LOCAL and no `PRIVACY.md` / `privacy-policy.md` → **P0 blocker**, TODO for user.

## Check 6: `ui/open-link` capability (optional)

```bash
rg -n "ui/open-link|openLink|capabilities" 
```

Only relevant if server returns URLs in tool responses. Surface as a P2 note.

## Check 7: Submission routing

Determine category from transport:
- Remote streamable-HTTP → https://clau.de/mcp-directory-submission
- Desktop extension → https://clau.de/desktop-extention-submission

Surface the right URL in the final output.

## Final pass: smoke-test the production URL

If remote: `curl -sI <prod-url>/.well-known/oauth-authorization-server` — expect 200 + valid JSON. If fails → **P0 blocker**.
