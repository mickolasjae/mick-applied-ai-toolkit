# Changelog

All notable changes to `mick-applied-ai-toolkit` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-06-15

### Fixed
- **README invocation syntax** — removed references to a nonexistent `/skill <name>` slash command. This plugin ships no slash commands; skills auto-load via the Skill tool when their description matches the user's natural-language request. README now documents the actual invocation pattern (natural-language triggers listed per skill).

### Added
- **`examples/` directory** — one runnable example per skill, demonstrating the canonical natural-language trigger and expected output shape:
  - `examples/mcp-directory-readiness.md`
  - `examples/anthropic-api-resilience.md`
  - `examples/evidence-gated-ci.md`
  - `examples/multi-model-routing.md`

## [0.1.1] - 2026-06-02

### Changed
- **`mcp-directory-readiness`** — corrected to the 2026 Anthropic MCP Directory submission policy. The previous version was scoped to the pre-2026 spec.
  - Requirements count: 7 → 9
  - `manifest.json` at `manifest_version: "0.2"+` with `privacy_policies` array is now required (was not a requirement under the previous spec)
  - Privacy policy is required for ALL transports, not just LOCAL connectors (previous spec said remote streamable-HTTP servers could skip)
  - OAuth must be 2.1 with PKCE S256 (was 2.0)
  - Required redirect URI allowlist: BOTH `https://claude.ai/api/mcp/auth_callback` AND `https://claude.com/api/mcp/auth_callback`
  - Stub tools (advertised as "v0.X scaffold, N tools stubbed") are now an explicit P0 reject — reviewers smoke-test
  - Added pre-submission curl snippets for the `.well-known/*` metadata endpoints

### Unchanged
- `anthropic-api-resilience`, `evidence-gated-ci`, `multi-model-routing` — no changes

### Sources for the policy delta
- https://claude.com/docs/connectors/building/submission
- https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy

## [0.1.0] - 2026-06-02

### Added
- Initial release. Four Claude Code skills:
  - **`mcp-directory-readiness`** — audits any MCP server against Anthropic MCP Directory submission requirements; generates gap list + pre-filled submission form. Pattern source: the actual Anthropic submission flow documentation + a real-world submission run.
  - **`anthropic-api-resilience`** — drops round-robin keys + 1s→5min exponential backoff + circuit breaker into any Anthropic SDK client. Pattern source: Anthropic's internal RL Studio codebase reference.
  - **`evidence-gated-ci`** — scaffolds smoketest + e2e + artifact-verified-mutation CI discipline. No claim of external state change ships without a captured response body on disk. Pattern source: the author's own production CI discipline across Tandem, Butterfly Security, LinguaMind, and mcp-butterfly.
  - **`multi-model-routing`** — cost-aware router with per-task-type model selection + per-call telemetry. Pattern source: Mercor's interview-scoring codebase reference (text → o4-mini cheap; multimodal → Gemini).

### Repository
- MIT licensed
- 8 topics tagged for discoverability: `claude-code`, `claude-skills`, `anthropic-mcp`, `model-context-protocol`, `applied-ai`, `agent-engineering`, `forward-deployed`, `prompt-engineering`
- Homepage links to https://butterflysecurity.org (author's primary production product)

[0.1.2]: https://github.com/mickolasjae/mick-applied-ai-toolkit/releases/tag/v0.1.2
[0.1.1]: https://github.com/mickolasjae/mick-applied-ai-toolkit/releases/tag/v0.1.1
[0.1.0]: https://github.com/mickolasjae/mick-applied-ai-toolkit/releases/tag/v0.1.0
