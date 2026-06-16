# Example: `mcp-directory-readiness`

## Scenario

You've built a remote MCP server on Cloudflare Workers and want to submit it to the Anthropic MCP Directory. Before pasting your URL into the submission form, you want to know what's missing.

## Trigger prompt

> Audit my MCP server for the Anthropic Directory. The deployed URL is `https://mcp.butterflysecurity.org/mcp` and the repo is `~/code/mcp-butterfly`.

## Expected agent behavior

1. Loads the `mcp-directory-readiness` skill (matched on "audit" + "Anthropic Directory").
2. Walks the 9 verified submission requirements from `skills/mcp-directory-readiness/requirements.md`:
   - HTTPS-only transport
   - OAuth 2.1 with PKCE (or documented exemption)
   - Tool annotations on every tool (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`)
   - Privacy policy + terms of service URLs reachable
   - Rate limits documented
   - Connector card metadata complete
   - At least one screenshot of real tool use
   - Support contact reachable
   - Versioned changelog
3. Probes the live endpoint and inspects the repo, producing a gap list per requirement (PASS / FAIL / NEEDS REVIEW).
4. Generates a pre-filled `submission-form.md` you can copy into <https://clau.de/mcp-directory-submission>.

## Expected output snippet

```
GAP LIST — mcp.butterflysecurity.org
[PASS] HTTPS only — verified via curl -I
[PASS] OAuth 2.1 + PKCE — discovered /.well-known/oauth-authorization-server
[FAIL] Tool annotations — 3 of 7 tools missing readOnlyHint:
       - revoke_session, rotate_key, escalate_incident
[NEEDS REVIEW] Privacy policy — URL returns 200 but content not reviewed
...
Pre-filled submission form written to submission-form.md
```
