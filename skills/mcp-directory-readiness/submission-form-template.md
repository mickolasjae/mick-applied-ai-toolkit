# Submission form — pre-filled template

Paste into https://clau.de/mcp-directory-submission (remote) or https://clau.de/desktop-extention-submission (desktop ext.).

## Server identity

- **Server name**: `[INFER from package.json "name" or manifest.json]`
- **One-line description**: `[INFER from package.json "description"; if generic, ASK USER]`
- **Category**: `[ASK USER: Productivity | Developer Tools | Data | Communication | other]`

## Connection

- **Transport**: `[remote streamable-HTTP | local stdio | desktop extension]`
- **Production URL**: `[INFER from wrangler.toml routes, vercel.json, fly.toml, or ASK USER]`
- **OAuth metadata URL**: `<prod-url>/.well-known/oauth-authorization-server`
- **OAuth scopes**: `[LIST from OAuth config code]`

## Tools (verify each row from `tools/list` handler)

| name | title | hint | description |
|---|---|---|---|
| `[name]` | `[title]` | `readOnly` or `destructive` | `[description]` |
| ... | ... | ... | ... |

Total tools: `[N]`. All have `title`: `[Y/N]`. All have a hint: `[Y/N]`.

## Documentation

- **Repo URL**: `[INFER from package.json "repository.url" or git remote]`
- **README covers**: connector name, what it does, OAuth scopes, 3+ example prompts `[Y/N]`
- **Hosted docs URL** (optional): `[ASK USER]`

## Contacts

- **Privacy contact email**: `[ASK USER]`
- **Security contact email**: `[ASK USER]`
- **Maintainer**: `[INFER from package.json "author"]`

## Example use cases (3 minimum)

1. `[ASK USER — concrete user prompt → tool sequence → outcome]`
2. `[ASK USER]`
3. `[ASK USER]`

## Privacy policy (LOCAL connectors only)

- **Privacy policy URL**: `[ASK USER — required for desktop ext. / local stdio only]`

---

## Next steps after submission

1. Note the submission timestamp — Anthropic publishes no SLA, assume 1-4 weeks
2. If queue stalls >2 weeks, email mcp-review@anthropic.com with the submission ID
3. Update any in-flight cover letters / outreach from "targeting submission" to "submitted on [DATE], awaiting review"
