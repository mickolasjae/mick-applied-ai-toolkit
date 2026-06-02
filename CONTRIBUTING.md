# Contributing

Thanks for the interest. This repo carries four Claude Code skills that I use myself across production AI products (Tandem, Butterfly Security, LinguaMind, mcp-butterfly). Contributions are welcome — particularly if you've hit an edge case any of the skills missed.

## What's in scope

- Fixing or extending the existing four skills
- Adding new skills that codify a discipline you'd want every project to inherit
- Improving documentation, examples, or per-skill templates
- Cross-platform additions (current templates are TypeScript + Python; Ruby / Go / .NET welcome)

## What's out of scope

- Skills that duplicate functionality of skills already published by Anthropic / Claude Code's built-in set
- Vendor-specific integrations that lock to a single non-Anthropic LLM provider
- Speculative skills that aren't backed by production usage (the bar is "this discipline saved me from a real bug shipping" — not "this could theoretically be useful")

## How to propose changes

1. **Open an issue first** describing the problem or addition. For new skills, please include: (a) what discipline it codifies, (b) which class of bug it prevents, (c) a 1-2 sentence example of when you'd invoke it.
2. **Branch from `main`**, name it `<skill-name>/<short-description>`.
3. **For new skills**, follow the existing structure:
   ```
   skills/<skill-name>/
   ├── SKILL.md                # YAML frontmatter + body
   ├── requirements.md         # (if applicable) the spec the skill enforces
   ├── audit-checklist.md      # (if applicable) concrete grep/curl/file checks
   ├── <language>-template.<ext>  # drop-in code in one or more languages
   └── integration-guide.md    # how to wire it into a real project
   ```
4. **Keep SKILL.md under ~2,000 words total** across all supporting files. Skills earn their token budget; don't pad.
5. **Bump the version in `plugin.json`** and add a `CHANGELOG.md` entry.
6. **Open a PR** with a summary of what changed and why.

## Skill design principles

- **Codify discipline, not implementation.** A skill should describe a posture (e.g., "every external mutation needs an artifact on disk") and provide templates to install it. It should not enforce a specific framework or library.
- **Verifiable triggers.** The `description:` frontmatter field lists natural-language phrases that should trigger the skill. Be specific. Vague triggers ("when working with APIs") produce false invocations.
- **Mechanical auto-fixes first, judgment-call TODOs second.** When the skill audits something, classify gaps as either auto-fixable (mechanical) or human-decision-required (judgment call). Don't make the user do mechanical work the skill can do.
- **Test against a corpus.** New skills should ship with a test that runs against representative inputs and asserts the expected output. Pure-regex / pure-text tests are fine; no API calls required.

## Code style

- Markdown: GFM, no trailing whitespace, soft-wrap.
- TypeScript: tsconfig at the repo root governs. Run `tsc --noEmit` before pushing.
- Python: 3.11+. Type hints on public functions. No external dependencies unless absolutely necessary; pure standard library preferred.

## License

MIT. By contributing you agree your contributions are released under MIT.

## Maintainer

[Mick Johnson](https://butterflysecurity.org) · [LinkedIn](https://linkedin.com/in/mick-johnson) · mick.jae.johnson@gmail.com
