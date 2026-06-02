---
name: mcp-directory-readiness
description: "Use when preparing an MCP server for submission to the Anthropic MCP Directory. Audits tool annotations, OAuth/HTTPS posture, and generates a gap list + pre-filled submission form data. Triggers on: 'submit to Anthropic Directory', 'MCP submission', 'audit my MCP server', 'is my MCP ready for the directory', 'directory submission checklist'."
---

# mcp-directory-readiness

Audits an MCP server against the 9 verified Anthropic MCP Directory submission requirements (sources: claude.com/docs/connectors/building/submission + support.claude.com Software Directory Policy article; corrected 2026-06-02). Produces a gap list, mechanical auto-fixes where possible, and a pre-filled submission form.

## When to use

- "Submit to Anthropic Directory" / "MCP submission"
- "Audit my MCP server" / "Is my MCP ready for the directory"
- "Directory submission checklist"
- Before pasting a connector into https://clau.de/mcp-directory-submission

## Workflow

### 1. Locate the server source

If not in the current working directory, ask once: "What's the path to the MCP server repo?" Default to cwd if user confirms. Identify:
- Transport: remote streamable-HTTP vs local stdio (determines privacy-policy requirement)
- Tool registration file (typically `server.ts`, `index.ts`, `tools/index.ts`, or wherever `tools/list` is handled)

### 2. Run the audit

Walk the 9 requirements in `requirements.md`. For each, run the corresponding check from `audit-checklist.md`. The highest-leverage checks (in order):
1. **Tool annotations** — every tool needs `title` AND one of `readOnlyHint|destructiveHint`. ~30% of rejections.
2. **manifest.json present at v0.2+** with `privacy_policies` array. Newly required as of 2026 — pre-2026 skill versions missed this.
3. **No stub tools** — README must not advertise "v0.X scaffold, N tools stubbed." Reviewers smoke-test.
4. **OAuth 2.1 + claude.com callback** — both `claude.ai` AND `claude.com` redirect URIs must be allowlisted.

For each gap, classify as:
- **Auto-fix (mechanical)**: missing `title`, missing hint annotation, missing `manifest.json`, missing README Privacy Policy section, http:// in config → surface the exact edit
- **TODO (judgment-call)**: which tools are destructive vs read-only, OAuth scope wording, stub-tool wiring → surface as a question for the user

For each gap, classify as:
- **Auto-fix (mechanical)**: missing `title`, missing hint annotation, http:// in config → surface the exact edit
- **TODO (judgment-call)**: which tools are destructive vs read-only, OAuth scope wording, privacy-policy content → surface as a question for the user

### 3. Generate the submission form draft

Use `submission-form-template.md`. Pre-fill every field that can be inferred from the codebase (server name, tool list, transport URL, OAuth metadata from `.well-known/oauth-authorization-server`). Leave `[ASK USER]` markers on judgment-call fields.

### 4. Surface submission URLs

- Remote MCP / MCP Apps: https://clau.de/mcp-directory-submission
- Desktop extensions: https://clau.de/desktop-extention-submission
- Stuck-queue contact: mcp-review@anthropic.com

## Supporting files

- `requirements.md` — the 9 verified requirements with rationale (corrected 2026-06-02)
- `audit-checklist.md` — concrete grep/file/curl checks per requirement, includes pre-submission smoke-test commands
- `submission-form-template.md` — pre-fill template with manifest.json, privacy-policy, OAuth allowlist fields

## Output format

Reply with:
1. **Gap list** (P0 blockers / P1 nice-to-haves) — table
2. **Auto-fix patches** — exact edits, grouped by file
3. **TODO questions** — one-shot list for the user
4. **Submission draft** — filled template, ready to paste into the form
