# Example: `evidence-gated-ci`

## Scenario

You're starting a new service that posts to Slack, revokes Okta sessions, and writes to a Postgres audit log. You want CI to **prove** each external mutation actually happened — not just that the code ran without throwing.

## Trigger prompt

> Add an evidence-gated CI pre-push gate to this project. It touches Slack, Okta, and our Postgres audit table — I want artifact-verified mutations, not "it should work."

## Expected agent behavior

1. Loads the `evidence-gated-ci` skill (matched on "evidence-gated CI", "pre-push gate", "artifact-verified").
2. Scaffolds three layers from `skills/evidence-gated-ci/`:
   - **Smoketest** — fast, local, no external calls; proves the binary boots.
   - **E2E** — hits a staging env; every external call writes its raw HTTP response to `artifacts/<timestamp>/<call>.json`.
   - **Artifact-verified mutation gate** — a post-e2e step that fails CI if any claimed mutation lacks a matching artifact (response body or bridge ack) on disk.
3. Drops a `.github/workflows/evidence-gated.yml` plus a pre-push git hook that runs the smoketest locally.
4. Adds an `artifacts/.gitkeep` and updates `.gitignore` to keep artifact bodies out of the repo while preserving the directory.

## Expected output snippet

```yaml
# .github/workflows/evidence-gated.yml (excerpt)
- name: E2E with artifact capture
  run: pnpm test:e2e --capture-artifacts=artifacts/${{ github.run_id }}

- name: Verify every claimed mutation has an artifact
  run: |
    node scripts/verify-artifacts.mjs \
      --manifest test/mutation-manifest.json \
      --artifacts artifacts/${{ github.run_id }}
    # exits non-zero if any mutation claimed in code lacks a captured response body
```
