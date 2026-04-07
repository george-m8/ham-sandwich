# Ham Sandwich — CHIRP Workbench Dashboard (Next.js / SvelteKit)

> Plan for evolving CHIRP CSV into a modular dashboard workbench with simple and advanced user paths.

## Related Documents

| Document | Description |
|---|---|
| [LLM-OVERVIEW.md](LLM-OVERVIEW.md) | Project-wide architecture |
| [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md) | CHIRP generator and list workflows |
| [LLM-SITE.md](LLM-SITE.md) | Current site architecture and UI |
| [LLM-FIREBASE.md](LLM-FIREBASE.md) | Auth, Firestore, Storage |
| [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) | Hosting, Workers, API guidance |

---

## Why a Workbench Dashboard?

Current CHIRP functionality is growing from a single generator into a multi-step workflow:

- Generate lists
- Merge and adjust lists
- Rename / normalise channels
- Finalise and publish
- Search lists and individual frequencies

A dashboard/workbench gives users a cleaner way to move between these tools while keeping quick generation simple for first-time users.

---

## Product Goals

1. Keep a **fast, simple CSV generator path** for most users.
2. Provide an **advanced toolbench path** for power users.
3. Let users **browse directory items**, tick desired entries, build a combined list, and download.
4. Treat tools as **modular operations** that can be composed in different orders.
5. Preserve location-aware metadata (same frequency can have different local context).

---

## Framework Choice

Both options are valid. Recommendation: **Next.js first** for this project.

### Option A — Next.js (Recommended)

Why it fits:

- Large ecosystem and long-term maintainability
- Strong support for hybrid rendering (static + server actions/API routes)
- Easy fit for dashboard patterns and route groups
- Good interoperability if keeping Cloudflare Worker APIs as backend

Trade-offs:

- Slightly more boilerplate than SvelteKit in some flows
- More convention-heavy decisions around app router usage

### Option B — SvelteKit

Why it fits:

- Very clean developer experience
- Excellent performance and small client payloads
- Great for highly interactive dashboards

Trade-offs:

- Smaller ecosystem compared with Next.js
- Team familiarity may be lower depending on contributors

### Decision Guidance

- If priority is broad ecosystem + easier onboarding for contributors: **Next.js**.
- If priority is minimalism + lean interactive UI and team is comfortable with Svelte: **SvelteKit**.

Assumed default for this plan: **Next.js**.

---

## UX Model: Two Lanes

### Lane 1: Quick Generate (Default)

For most users:

1. Choose provider/model/key
2. Enter prompt/location/options
3. Generate
4. Preview
5. Download CSV

No mandatory exposure to advanced tools.

### Lane 2: Workbench (Advanced)

For power users:

1. Open a list workspace
2. Add candidates from generation and/or directory selections
3. Run modules (merge, dedupe, rename, validate, annotate)
4. Review conflicts and location variants
5. Finalise list
6. Publish list + index channel entries

---

## Dashboard Information Architecture

## Top-Level Routes

- `/chirp` → quick generate page
- `/workbench` → advanced dashboard home
- `/workbench/lists/[id]` → list editor workspace
- `/directory` → public browse/search page
- `/directory/frequency/[id]` → frequency detail
- `/directory/list/[id]` → list detail

### Workbench Modules (as cards/panels)

1. **Generator Module**
   - Prompt + constraints → candidate channels
2. **Directory Picker Module**
   - Search directory lists/frequencies, tick to add
3. **Merge Module**
   - Merge policies (`keep_first`, `keep_latest`, `keep_both`, `merge_metadata`)
4. **Rename Module**
   - Rule-based + LLM-assisted station naming
5. **Validation Module**
   - None/standard/strict + repair suggestions
6. **Location Context Module**
   - Manage location-specific comments/usage variants
7. **Export/Publish Module**
   - Finalise, download CSV, publish list + item index

---

## Core User Stories

### Simple User Story

- “I just want a useful CSV quickly.”
- Uses quick generate lane only.

### Collector User Story

- “I want to browse the directory and pick entries to combine.”
- Uses directory picker + merge + export.

### Advanced Curator Story

- “I want to normalise naming, preserve location variants, and publish a high-quality set.”
- Uses full workbench and finalises curated list.

---

## Data Model (Workbench-Oriented)

### Collections

- `csv_directory/{listId}` (finalised lists)
- `frequency_directory/{frequencyId}` (indexed channels)
- `users/{uid}/csv_drafts/{draftId}` (draft list workspaces)
- `users/{uid}/saved_csvs/{listId}` (linked published lists)
- `users/{uid}/favourites/{entityType-id}` (private favourites)

### List Document (Final)

- `status`: `finalised`
- `channels`: full channel array
- `preview_channels`: capped preview subset
- `metadata`: generator + merge + validation settings

### Draft Document

- `status`: `draft`
- `channels`
- `module_history`: operations applied in sequence
- `updated_at`

### Frequency Document

- Back-reference: `list_id`
- Core channel technical fields
- `location_context`
- `service_tags`

---

## Directory + Selection Workflow

Required behavior:

1. User searches directory (lists and frequencies).
2. User ticks entries to include.
3. System creates/updates a workspace list from selections.
4. User can merge, rename, validate.
5. User downloads or finalises.

Selection rules:

- Selecting a **list** imports all its channels.
- Selecting a **frequency** imports only that entry.
- Duplicate policy is prompted or uses current workspace default.

---

## Module Contract Pattern

Each module should behave like a pure operation where possible:

```ts
interface WorkbenchModule {
  id: string;
  label: string;
  run(input: ListWorkspace, options: Record<string, unknown>): Promise<ModuleResult>;
}

interface ModuleResult {
  workspace: ListWorkspace;
  warnings: string[];
  changes: {
    added: number;
    updated: number;
    removed: number;
  };
}
```

Benefits:

- Composable tools
- Clear operation history
- Easier testing and rollback

---

## Suggested Tech Architecture (Next.js Default)

Frontend:

- Next.js app router
- Shared UI components for module cards, table/grid, side panel
- Quick lane and advanced lane share core list state logic

Backend:

- Keep Cloudflare Worker endpoints for LLM and location where useful
- Optionally add Next.js route handlers as BFF layer for dashboard actions
- Continue Firebase as source of truth

State:

- Client state for active workspace (Zustand or React context + reducer)
- Persist draft snapshots to Firestore and session fallback

Auth:

- Firebase Auth in web app
- Anonymous mode for quick generate + local drafts

---

## Phased Delivery Plan (for New Branch)

### Phase 1 — Foundation Shell

- Create dashboard shell and route structure
- Implement quick generate lane parity
- Add workspace state model

### Phase 2 — Directory Composition

- Add dual directory search (lists/frequencies)
- Add tick-to-include selection cart
- Add create-from-selection workflow

### Phase 3 — Modules

- Merge module with policies
- Rename module with LLM fallback
- Validation module and conflict panel

### Phase 4 — Publish + Polish

- Finalise/publish flow
- Location variant management UI
- Audit logs and operation history

---

## Non-Goals (for Initial Dashboard Version)

- No full plugin marketplace for custom user modules
- No heavy real-time collaboration editing in v1
- No replacement of existing public pages until parity is achieved

---

## Risks and Mitigations

1. **Scope creep in advanced tools**
   - Mitigation: keep lane separation and phase gates.
2. **Data model drift between drafts and finalised lists**
   - Mitigation: define shared schemas early.
3. **LLM rename/repair unpredictability**
   - Mitigation: deterministic fallback and review diffs.
4. **Performance with large frequency indexes**
   - Mitigation: query pagination + indexed fields.

---

## Branch Plan

When ready, create a feature branch for the dashboard initiative, for example:

- `feature/chirp-workbench-dashboard`

Suggested first PR scope:

- Add route skeleton + shared workspace types
- Implement quick lane + directory selection cart only
- Defer advanced module execution UI to follow-up PRs

---

## Success Criteria

- New users can generate/download CSV with fewer clicks than current flow.
- Advanced users can compose lists from directory selections and apply merge/rename/validation tools.
- Finalised lists publish cleanly and index per-frequency records.
- Search supports both list-level and frequency-level discovery.
- Module pattern enables adding future tools without major page rewrites.
