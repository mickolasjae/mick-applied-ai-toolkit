# Task taxonomy — task type → model map

A starter map. **The cost-vs-quality tradeoff is workload-specific** — re-run an eval on your own data before adopting a row verbatim. Prices below are public list prices as of June 2026 and will drift; treat them as relative not absolute.

## How to use this map

1. Identify the task types in your application. The granularity that matters is **"what's the quality bar?"** — if two call sites have the same bar, they're one task type.
2. Pick the row in this table that matches.
3. Run your eval set against that model. If it clears the bar, ship it. If not, escalate one tier.
4. Re-run the eval every quarter. Tier-shifts happen fast.

## The map

| Task type | Modality | Cheapest model that typically clears the bar | Provider | Input $/Mtok | Output $/Mtok | Why this tier |
|---|---|---|---|---|---|---|
| `text_classification` | Text in / 1-token-class out | `gpt-5-nano` | OpenAI | $0.05 | $0.40 | One-shot label, no reasoning needed |
| `vocab_extraction` | Text in / structured list out | `claude-haiku-4-5` | Anthropic | $0.80 | $4.00 | Needs spans + lemma normalization; nano misses idioms |
| `rag_synthesis` | Text + retrieved chunks → grounded answer | `claude-sonnet-4-7` | Anthropic | $3.00 | $15.00 | Citation faithfulness + multi-doc reasoning |
| `agent_planning` | Long context, multi-step tool use | `claude-opus-4-7` | Anthropic | $15.00 | $75.00 | Failure modes here cost more than the model premium |
| `code_completion` | Code in / code out, IDE-grade | `claude-sonnet-4-7` | Anthropic | $3.00 | $15.00 | Sonnet beats Haiku materially on multi-file edits |
| `voice_transcription` | Audio → text | `nova-3` | Deepgram | priced per audio-minute | — | Dedicated ASR beats general LLMs on cost + WER |
| `multimodal_reasoning` | Image / video / audio in → text out | `gemini-2.5-flash` | Google | $0.30 | $2.50 | Best $/quality on long video and frame-grids |
| `long_context_summarize` | 200k+ tokens → 1-page summary | `gemini-2.5-flash` | Google | $0.30 | $2.50 | 1M-context window without 2M-context premium |
| `creative_writing` | Style-sensitive open-ended generation | `claude-sonnet-4-7` | Anthropic | $3.00 | $15.00 | Voice quality matters; nano/Haiku are flat |

## Pattern: collapse into 4 tiers

Most apps don't need 9 task types. Internally we collapse to 4:

1. **Cheap text** — classification, light extraction, intent detection
2. **Mid text** — RAG synthesis, code edits, creative writing
3. **Expensive reasoning** — agent planning, multi-step tool use, complex evals
4. **Multimodal** — anything with image/audio/video input

If you only have one knob to turn per quarter, those are the four to keep clean.

## When to deviate from this map

- **Latency-critical UX** — sometimes you pay 5x to get p95 latency under 800ms. Track that explicitly in the eval; cost-only ranking misses it.
- **Provider concentration risk** — for a production system, spreading task types across 2+ providers buys you continuity if one provider has an incident. Don't let all four tiers above sit on one vendor.
- **Fine-tuned alternatives** — for high-volume narrow tasks (e.g., classify intent over millions of utterances), a small fine-tuned open model on Together / Fireworks can beat all of the above on $/call. Eval it the same way.

## Eval set discipline

The whole map is only as good as the eval set behind each row. For each task type:
- Keep **30–100 golden examples** with expected outputs (or rubric scores).
- Re-run the eval **whenever a new model ships** (not just quarterly).
- Track **pass rate by task type**, not aggregate. Aggregate hides tier-specific regressions.
- Version the eval set in git; treat it like test code.

When the eval set passes for a cheaper model, change exactly one row in the router map. Telemetry will show the per-task cost drop within a day.
