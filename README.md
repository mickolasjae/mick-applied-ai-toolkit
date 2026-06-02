# mick-applied-ai-toolkit

Four Claude Code skills extracted from shipping production AI products end-to-end with the agentic coding loop. Each skill codifies a discipline that survives contact with paying users.

## The skills

| Skill | What it does | Source pattern |
|---|---|---|
| [`mcp-directory-readiness`](skills/mcp-directory-readiness/) | Audits any MCP server against the Anthropic MCP Directory submission requirements; generates gap list + pre-filled form data | Anthropic's published submission flow + my own mcp-butterfly submission run |
| [`anthropic-api-resilience`](skills/anthropic-api-resilience/) | Drops round-robin keys + 1s→5min exponential backoff + circuit breaker into any Anthropic SDK client | Production reliability pattern surfaced in Anthropic's internal RL Studio codebase |
| [`evidence-gated-ci`](skills/evidence-gated-ci/) | Scaffolds smoketest + e2e + artifact-verified-mutation CI gate — no external mutation ships without a captured response | Discipline I run across Tandem, Butterfly Security, LinguaMind, and mcp-butterfly |
| [`multi-model-routing`](skills/multi-model-routing/) | Cost-aware router with per-task-type model selection + per-call telemetry | Multi-model routing pattern from Mercor's interview scoring codebase |

Each skill is one folder under `skills/` containing a `SKILL.md` with YAML frontmatter and supporting templates (TypeScript + Python drop-in code, reference docs, checklists).

## Install (one skill)

Symlink any individual skill into your Claude Code skills directory:

```bash
ln -s "$(pwd)/skills/mcp-directory-readiness" ~/.claude/skills/mcp-directory-readiness
```

The skill auto-registers on the next Claude Code session start.

## Install (all four)

```bash
for s in skills/*/; do
  ln -s "$(pwd)/$s" "$HOME/.claude/skills/$(basename $s)"
done
```

## Use

Once installed, invoke any skill from Claude Code by name:

```
/skill mcp-directory-readiness
/skill anthropic-api-resilience
/skill evidence-gated-ci
/skill multi-model-routing
```

Or just describe the work — each skill's frontmatter lists the natural-language triggers ("audit my MCP server", "Claude API rate limit", "add CI to this project", "route between Claude and GPT").

## Why these four

I ship production AI products solo with Claude Code as the primary editor. These four skills are the disciplines that, when missing, broke something in front of real users.

- **`mcp-directory-readiness`** — built while preparing `mcp-butterfly` for the Anthropic MCP Directory. The mechanical checks (tool annotations, OAuth posture, HTTPS) account for ~80% of submission rejections and are entirely automatable.
- **`anthropic-api-resilience`** — built after watching `LinguaMind` silently drop user requests during a Claude API rate-limit window. Single-key clients fail badly at scale; round-robin + backoff converts it to invisible failover.
- **`evidence-gated-ci`** — codifies what I do in every project's CLAUDE.md so it's portable. The load-bearing layer is artifact-verified mutations: no claim of external state change ships without a captured HTTP response on disk. Prevents the class of agent-fabricated state changes that pass review because nobody asked the external system whether the mutation actually happened.
- **`multi-model-routing`** — built for the LinguaMind tutor (vocab extraction → Haiku, RAG synthesis → larger model). Routing by task-type with per-call cost telemetry compounds savings as DAU scales.

## The portfolio behind the toolkit

- **[Tandem](https://tandembooks.co)** — universal ebook + audiobook reader, live on iOS / iPadOS / macOS, visionOS in App Review. SwiftUI across four Apple platforms.
- **[Butterfly Security](https://butterflysecurity.org)** — paying-customer SaaS for identity-infrastructure disaster recovery. Listed in the Okta Integration Network as an API Service Integration.
- **[LinguaMind](https://trylinguamind.app)** — AI language coach on Cloudflare Pages + D1 + Workers AI + Claude Haiku.
- **mcp-butterfly** — remote streamable-HTTP MCP server on Cloudflare Workers + Durable Objects exposing Butterfly Security as Claude-callable tools.

## Contributing

Issues and PRs welcome. Each skill has its own templates and reference files in the `skills/<skill-name>/` folder — keep the structure consistent if you're adding a new skill.

## License

MIT — see [LICENSE](LICENSE).

## Author

[Mick Johnson](https://butterflysecurity.org) · [LinkedIn](https://linkedin.com/in/mick-johnson) · [GitHub](https://github.com/mickolasjae)
