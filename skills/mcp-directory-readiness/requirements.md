# Anthropic MCP Directory — verified requirements

Source: https://claude.com/docs/connectors/building/submission

## The 7 requirements

### 1. OAuth 2.0 for authenticated services
Any tool that touches user-scoped data must authenticate via OAuth 2.0. Unauthenticated read-only servers (e.g. public docs lookup) are exempt. Look for `.well-known/oauth-authorization-server` or an `authorize` route.

### 2. Every tool has a `title` field
In each tool's schema/registration object. `title` is the human-readable label shown in Claude's UI — separate from the machine `name`. Missing `title` = automatic rejection.

### 3. Every tool declares `readOnlyHint` OR `destructiveHint`
Tool annotations. Must be one or the other (or both, where `destructiveHint:false` + `readOnlyHint:true` is the safe-read case). Mutations: `destructiveHint:true`. Queries: `readOnlyHint:true`. This drives Claude's consent prompts.

### 4. HTTPS for all transport
Remote servers must serve over HTTPS. No `http://` URLs in production config. Cloudflare Workers, Vercel, Fly — all HTTPS by default. Self-hosted: verify the cert chain.

### 5. Privacy policy — LOCAL connectors only
Remote streamable-HTTP servers do **not** need a privacy policy at submission time. Local connectors (desktop extensions, stdio servers shipping as binaries) do. Skip this check for remote.

### 6. `ui/open-link` capability — optional
If the server exposes web links (dashboards, doc pages), declare this capability. Not required. Skip unless the server actually opens URLs.

### 7. Submission category routing
- **Remote MCP / MCP Apps** → https://clau.de/mcp-directory-submission
- **Desktop extensions** → https://clau.de/desktop-extention-submission
- **Review-queue contact** (use only if submission stalls >2 weeks): mcp-review@anthropic.com

## Common rejection patterns

1. Missing `title` on even one tool → reject
2. Mixed annotations (some tools have hints, some don't) → reject
3. http:// anywhere in the connection config → reject
4. OAuth flow returns 500 on production URL → reject (test it before submitting)
5. Tool descriptions that don't match what the tool does → reject on review
