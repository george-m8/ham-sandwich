# Ham Sandwich — Editor Bots (Automated Content Generation)

> Server-side, scheduled LLM agents that generate and maintain site content (test questions, radio recommendations, links, and optional blog drafts) using Pydantic AI, strict JSON validation, deduplication, and safe publish workflows.

## Related Documents

| Document | Description |
|---|---|
| [LLM-OVERVIEW.md](LLM-OVERVIEW.md) | High-level architecture and project scope |
| [LLM-SITE.md](LLM-SITE.md) | Site pages and where generated content appears |
| [LLM-TEST.md](LLM-TEST.md) | Test question schema and quiz behavior |
| [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md) | Existing LLM validation and correction patterns |
| [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) | Workers, API routing, and deployment options |
| [LLM-FIREBASE.md](LLM-FIREBASE.md) | Firestore data model and security patterns |
| [LLM-DOCKER.md](LLM-DOCKER.md) | Local and containerized execution |
| [example.env](../example.env) | Environment variable template |

---

## Goal

Build a repeatable **editor-bot system** that can run on a schedule and automatically create or improve structured site content while staying accurate and safe.

Primary outcomes:

1. Generate new items for:
   - Test questions (`/data/questions/*.json`)
   - Radio recommendations (`/data/radios.json`)
   - Useful links (`/data/links.json`)
   - (Optional) blog draft metadata/content
2. Validate all outputs with strict schemas
3. Check for duplicates against existing content
4. Reject/fix malformed outputs automatically
5. Publish approved JSON back into the site data pipeline

---

## Core Principles

- **Server-side only**: no generation logic in browser clients
- **Structured output first**: all model responses must parse into Pydantic models
- **Validation before publish**: schema, factual checks, policy checks, dedupe, and quality gates
- **Deterministic IDs**: generated entries use stable IDs to avoid duplicate inserts
- **Idempotent runs**: rerunning the same job should not produce uncontrolled duplicates
- **Traceability**: every item stores metadata about generation time, model, and sources
- **Safe fallback**: if validation fails, return correction feedback to the model; if still invalid, quarantine item instead of publishing

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Scheduler (cron / cloud scheduler)            │
│          e.g. every night + weekly deep-refresh jobs           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Editor Bot Orchestrator (Python)               │
│                      (Pydantic AI agents)                      │
│                                                                 │
│ 1) Discover topics/items to create                              │
│ 2) Research pass (sources + evidence)                           │
│ 3) Draft structured JSON output                                 │
│ 4) Validate (schema + business rules + dedupe)                  │
│ 5) Correction loop for invalid fields                           │
│ 6) Persist as candidate or publish                              │
└──────────────────────────────┬──────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│ Site Data JSON   │  │ Firestore (meta) │  │ Optional Git PR flow │
│ /data/*.json     │  │ runs/audit/jobs  │  │ for human review      │
└──────────────────┘  └──────────────────┘  └─────────────────────┘
```

---

## Runtime Options

### Option A (Preferred now): Python service on a server/container

Run a Python worker (using Pydantic AI) in Docker on:
- VPS
- Fly.io / Render / Railway / Cloud Run
- A small always-on server

Use:
- `cron` or APScheduler for recurring jobs
- Secure environment variables for provider API keys
- Cloudflare + Firebase APIs for publish operations

Why this is recommended:
- Pydantic AI is native in Python
- Easier validation and rich schema handling
- Easier long-running batch jobs and retries

### Option B: Cloudflare-triggered hybrid

- Cloudflare Cron Trigger invokes a Worker endpoint
- Worker triggers Python bot service webhook
- Python service performs generation + validation
- Worker can ingest final payload and write to storage or Firestore

Use this when you want Cloudflare-native scheduling with Python execution offloaded to a dedicated service.

---

## Bot Roles (Multi-Agent Pattern)

Use one orchestrator with specialized agent tasks.

### 1) Topic Planner Agent

Input:
- Existing content index
- Category coverage stats
- Priority signals (low-content categories, stale entries)

Output JSON:
- Candidate generation tasks
- Target type (`question`, `radio`, `link`, `blog_draft`)
- Category, difficulty, count target

### 2) Research Agent

Input:
- Task from planner

Responsibilities:
- Gather high-quality sources
- Prefer authoritative references (regulators, manuals, trusted retailers/manufacturers)
- Extract key facts to structured evidence blocks

Output JSON:
- `sources[]` with URL, title, publisher, access date
- Fact snippets used for generation

### 3) Draft Agent

Input:
- Task + research evidence + required schema

Output:
- Draft items that already conform to strict schema
- Required fields only; no prose outside JSON

### 4) Validator/Refiner Agent

Input:
- Draft items + validation errors

Responsibilities:
- Correct invalid fields
- Remove unverifiable claims
- Reformat to exact schema

Output:
- Corrected JSON only

---

## Content Types and Schemas

Use Pydantic models as source-of-truth schemas and export JSON Schema for prompts.

### A) Test Question Item (aligned with [LLM-TEST.md](LLM-TEST.md))

```json
{
  "id": "LR-142",
  "category": "licensing-and-regulations",
  "subcategory": "operating-conditions",
  "question": "...",
  "options": [
    { "key": "A", "text": "...", "reason_if_wrong": "..." },
    { "key": "B", "text": "...", "reason_if_wrong": "..." },
    { "key": "C", "text": "...", "reason_if_wrong": "..." },
    { "key": "D", "text": "...", "reason_if_wrong": "..." }
  ],
  "correct": "B",
  "reason": "...",
  "difficulty": 2,
  "tags": ["ofcom", "operating"]
}
```

Validation rules:
- Exactly 4 options (`A`–`D`)
- `correct` must exist in options
- No duplicate option text
- Question must be category-appropriate
- `reason` must explain why the correct answer is correct

### B) Radio Recommendation Item

Use/extend your existing radio schema in `/data/radios.json`.

Suggested minimum fields:

```json
{
  "slug": "yaesu-ft-65r",
  "name": "Yaesu FT-65R",
  "brand": "Yaesu",
  "type": "handheld",
  "bands": ["VHF", "UHF"],
  "price_gbp": 109.99,
  "summary": "...",
  "pros": ["..."],
  "cons": ["..."],
  "affiliate_url": "https://...",
  "image": "/images/radios/yaesu-ft-65r.jpg",
  "tags": ["beginner", "dual-band"],
  "sources": [
    { "url": "https://...", "title": "...", "publisher": "...", "accessed_at": "2026-03-30" }
  ],
  "updated_at": "2026-03-30T00:00:00Z"
}
```

Validation rules:
- `slug` unique, URL-safe
- `price_gbp >= 0`
- At least 1 source URL
- No unverifiable superlatives without source support

### C) Useful Link Item

Use/extend schema in `/data/links.json`.

```json
{
  "id": "link-rsgb-foundation-guide",
  "title": "RSGB Foundation Licence Guidance",
  "url": "https://...",
  "description": "...",
  "category": "training",
  "tags": ["foundation", "uk"],
  "last_checked_at": "2026-03-30T00:00:00Z"
}
```

Validation rules:
- URL must be HTTPS
- Domain not blocked
- Duplicate URL/title checks against existing links

---

## Prompt + Validation Contract (Critical)

Every generation request should include:

1. JSON schema (or concise field contract)
2. "Return JSON only" requirement
3. Business rules (e.g., valid categories, uniqueness constraints)
4. Known existing IDs/slugs to avoid collisions
5. Allowed value enums where possible

Example instruction block:

```
Return ONLY JSON matching the provided schema.
Do not include markdown fences or commentary.
If uncertain, omit the item rather than guessing.
All factual claims must be supported by a provided source.
```

---

## Correction Loop for Invalid Output

Use the same principle as CHIRP strict validation in [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md).

Pipeline:

1. Parse model output as JSON
2. Validate with Pydantic model
3. Run custom business validation
4. If invalid:
   - Build compact error report (field path + message + expected type/rule)
   - Send invalid payload + errors back to Refiner agent
5. Revalidate
6. Fail after max attempts (e.g. 2 retries) and quarantine

Example validator feedback payload:

```json
{
  "errors": [
    { "path": "items[0].options", "message": "Must contain exactly 4 options" },
    { "path": "items[2].url", "message": "Must be HTTPS" }
  ],
  "instruction": "Return corrected JSON only. Keep valid items unchanged."
}
```

---

## Deduplication Strategy

Dedupe must run against **existing site data + current batch**.

### Questions

Duplicate if any of:
- Normalized question text exact match
- Same category + highly similar options set
- Existing `id`

### Radios

Duplicate if any of:
- Same normalized `name` + `brand`
- Existing `slug`
- Same affiliate URL and product identity

### Links

Duplicate if any of:
- Same canonical URL
- Same normalized title + domain

Action:
- Keep highest-quality item
- Discard or merge duplicates
- Log merge decisions in run metadata

---

## Accuracy and Source Quality

To make the bot useful and trustworthy:

- Require at least one authoritative source per factual item
- Prefer regulator/manufacturer/manual/official references over random blogs
- Store citation metadata per generated item
- Add a confidence score from rule checks, not just model self-rating

Suggested confidence gates:
- `>= 0.90`: auto-publish
- `0.75–0.89`: publish to review queue
- `< 0.75`: reject/quarantine

---

## Publish Modes

### Mode 1: Auto-publish (trusted categories)

- For low-risk updates (e.g., non-exam links, minor radio metadata)
- Directly writes to JSON data file or Firestore document
- Requires high confidence + clean validation

### Mode 2: Review-required (recommended default)

- Bot writes to `pending` collection/file first
- Human reviews and approves
- Approved items are merged into canonical data files

### Mode 3: Git PR workflow

- Bot commits proposed JSON changes to branch
- Opens PR for review
- Merge triggers Cloudflare deploy

This is ideal for transparent change control and rollback.

---

## Data Storage and Metadata

Track run metadata (Firestore or JSON log file):

```json
{
  "run_id": "editorbot-2026-03-30T02:00:00Z",
  "job_type": "test-questions",
  "status": "completed",
  "provider": "openai",
  "model": "gpt-4o",
  "items_attempted": 25,
  "items_valid": 18,
  "items_published": 15,
  "items_quarantined": 3,
  "duration_ms": 68210,
  "started_at": "2026-03-30T02:00:00Z",
  "finished_at": "2026-03-30T02:01:08Z"
}
```

Per-item metadata (recommended):
- `generated_by`
- `generated_at`
- `source_urls[]`
- `confidence`
- `review_state` (`pending`, `approved`, `rejected`, `auto_published`)

---

## Scheduling Plan

Suggested cadence:

- **Daily (light)**
  - Check stale links
  - Generate 2–5 candidate radios
- **3x per week (medium)**
  - Generate 10–20 test questions in weak categories
- **Weekly (deep)**
  - Full coverage report
  - Regenerate low-confidence or outdated content

Avoid overlap using a distributed lock (Firestore doc or KV key).

---

## Security Requirements

- API keys only in server-side secrets/env variables
- Never log raw prompts containing sensitive data
- Never log provider API keys or tokens
- Rate-limit editor-bot trigger endpoints
- Require signed auth for manual trigger routes
- Keep an allowlist of source domains for outbound research where practical

Follow platform guidance in [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) and data controls in [LLM-FIREBASE.md](LLM-FIREBASE.md).

---

## Suggested Python Project Layout

```text
editor-bots/
├── app/
│   ├── main.py
│   ├── scheduler.py
│   ├── agents/
│   │   ├── planner.py
│   │   ├── researcher.py
│   │   ├── drafter.py
│   │   └── refiner.py
│   ├── models/
│   │   ├── question.py
│   │   ├── radio.py
│   │   ├── link.py
│   │   └── run_log.py
│   ├── validators/
│   │   ├── schema.py
│   │   ├── business_rules.py
│   │   └── dedupe.py
│   ├── publishers/
│   │   ├── json_files.py
│   │   ├── firestore.py
│   │   └── git_pr.py
│   └── utils/
│       ├── hashing.py
│       ├── text_normalize.py
│       └── http.py
├── tests/
├── requirements.txt
├── Dockerfile
└── .env
```

---

## Human Setup Checklist

1. Provision Python runtime host (container/serverless container/VPS)
2. Add secrets for LLM providers and publishing credentials
3. Configure scheduler jobs (cron/APScheduler/cloud scheduler)
4. Create Firestore collections for `editor_bot_runs` and optional `pending_content`
5. Configure source allowlist / denylist
6. Enable alerting (email/Slack/webhook) on repeated job failures
7. Start with review-required mode before enabling auto-publish

---

## Minimal MVP (First Iteration)

Start with one bot job type: **test questions only**.

MVP scope:
- Generate 10 questions per run for one category
- Validate against [LLM-TEST.md](LLM-TEST.md) schema
- Deduplicate against existing category file
- Save valid items to `pending` JSON
- Manual approval merges into `/data/questions/*.json`

Then expand to radios and links once quality is stable.

---

## Example End-to-End Flow

1. Scheduler triggers `job=test-questions category=propagation count=10`
2. Planner confirms category deficit
3. Researcher gathers references (RSGB/Ofcom/etc.)
4. Drafter generates structured question JSON
5. Validator checks schema/business rules
6. Refiner fixes invalid records (max 2 attempts)
7. Dedupe removes existing/similar items
8. Publish to `pending` queue (or auto-publish if high confidence)
9. Write run log + metrics
10. Site updates via deploy/data refresh path

---

## Failure Handling

- **Malformed JSON**: retry with strict "JSON-only" instruction
- **Schema invalid after retries**: quarantine and alert
- **No reliable sources**: reject item, mark as unresolved
- **Duplicate-only batch**: job completes with `0 published`, not an error
- **Provider outage**: fail over to secondary model/provider

---

## Success Metrics

Track these KPIs per week:

- Validation pass rate
- Duplicate rejection rate
- Human approval rate (if review queue enabled)
- Post-publish correction rate
- Time-to-publish from generation
- Coverage growth by category (questions/radios/links)

---

## Implementation Notes for This Repository

- Keep canonical content files in `/data/*` aligned with current frontend readers in `/js/*.js`
- Reuse existing validation/correction ideas from CHIRP flow in [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md)
- Keep generated test item schema fully compatible with [LLM-TEST.md](LLM-TEST.md)
- For deployment options and env setup, follow [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) + [LLM-DOCKER.md](LLM-DOCKER.md)

---

## Recommended Next Step

After this document is accepted, create a small `editor-bots/` MVP service with:

1. One scheduled `test-question` job
2. Pydantic schemas + strict validation
3. Dedup against `/data/questions/*.json`
4. Pending queue output + run logs

This gives a safe baseline before enabling fully automated publishing for all content types.
