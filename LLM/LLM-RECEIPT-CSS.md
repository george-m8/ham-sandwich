# Ham Sandwich — receipt-css Integration Guide

> Guidance for using, extending, and safely updating `receipt-css` inside Ham Sandwich and related projects.

## Purpose

`receipt-css` is the shared visual foundation for Ham Sandwich. It provides the receipt-style typography, spacing, wrappers, controls, and utility classes used across all pages. This document defines practical usage rules and maintenance workflow so updates stay consistent and safe.

## Related Documents

| Document | Description |
|---|---|
| [LLM-OVERVIEW.md](LLM-OVERVIEW.md) | Project-level architecture and roadmap |
| [LLM-SITE.md](LLM-SITE.md) | Site layout, page conventions, shared wrappers |
| [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) | Build/deploy behavior and sync expectations |
| [LLM-RECEIPT-JS.md](LLM-RECEIPT-JS.md) | JavaScript animation layer built on top of receipt-css |

---

## Source-of-Truth Structure

### Repository Relationship

- `receipt-css/` is treated as an upstream reusable style library
- Project-facing import bridges live in `/css`:
  - `/css/text.css`
  - `/css/layout.css`
  - `/css/inputs.css`
- Project overrides belong in `/css/theme.css`

### Why this split

- Shared look remains centralized
- Ham Sandwich can add minimal site-specific behavior without forking core library CSS
- Updates from upstream can be pulled with low merge risk

---

## Required Inclusion Pattern

Every page should include styles in this order:

```html
<link rel="stylesheet" href="/css/text.css">
<link rel="stylesheet" href="/css/layout.css">
<link rel="stylesheet" href="/css/inputs.css">
<link rel="stylesheet" href="/css/theme.css">
```

### Ordering rules

1. Core text first
2. Core layout second
3. Inputs/components third
4. Project theme overrides last

Do not swap this order.

---

## Class Usage Recommendations

### Shell and section classes

- Use `.receipt-wrapper` for standard page width
- Use `.receipt-wrapper-wide` for dense lists/directories/tables
- Keep one main wrapper per page shell when possible
- Use `.receipt-header`, `.receipt-section`, `.receipt-footer` consistently

### Forms and controls

- Use `.form-row` and `.form-group` for grouped inputs
- Use `.dropdown` for selects
- Use `.btn-box` for primary actions
- Use `.btn-secondary` for secondary actions

### Data output

- Use `.output-box` for generated text/CSV previews/results
- Keep generated content in monospace flow, avoid ad hoc typography overrides

---

## Best Practices

### 1) Keep visual tokens centralized

- Prefer existing CSS variables/tokens from `receipt-css`
- In Ham Sandwich, only add theme tweaks through `/css/theme.css`
- Avoid hardcoding repeated one-off values inside HTML or page scripts

### 2) Avoid page-local style drift

- Do not add inline `style="..."` for layout/styling unless unavoidable
- If multiple pages need the same tweak, move it to `/css/theme.css`

### 3) Accessibility and readability

- Maintain strong text contrast (receipt style still needs legibility)
- Keep tap targets usable on mobile
- Preserve clear focus states

### 4) Performance

- Keep selector specificity low and predictable
- Avoid large, deeply nested selectors in project overrides

### 5) Upgrade safety

- Treat `receipt-css` as external dependency behavior
- Prefer additive overrides in `theme.css` over editing upstream files directly

---

## Sync and Update Workflow

### Local sync command

```bash
npm run sync:receipt-css
```

Behavior:
- If `receipt-css/` is a git clone, pull latest with fast-forward
- If folder exists but is not git-backed, leave it untouched

### Dev/build usage

- `npm run dev` should sync shared style libraries before serving
- `npm run build` should sync shared style libraries before producing deployable output

### Recommended release process

1. Pull latest `receipt-css`
2. Visual smoke-test key pages (`/`, `/chirp-csv/`, `/test/`, `/radios/`, `/links/`)
3. Apply only minimal `theme.css` overrides needed for compatibility
4. Deploy

---

## Common Pitfalls

- Editing `receipt-css` locally and forgetting upstream sync strategy
- Creating duplicate utility styles in `theme.css` that already exist in `receipt-css`
- Mixing wrapper widths unpredictably inside one page
- Breaking import order and then compensating with high-specificity overrides

---

## Guidance for Future LLM Tasks

When asking an LLM to add/modify UI in this project:

1. Explicitly require use of existing `receipt-css` classes before introducing new ones
2. Prefer updating `theme.css` over inline styles
3. Keep wrappers and structure aligned with `LLM-SITE.md`
4. Ask for minimal, surgical style changes and avoid broad restyling
5. Validate mobile behavior whenever wrapper widths or nav layout are touched

---

## Extension Strategy

If additional shared styles are needed:

- Add them in the upstream `receipt-css` repo when reusable
- Keep Ham Sandwich-specific visual identity (logos/content spacing) in `theme.css`
- Document new reusable patterns in this file and `LLM-SITE.md`
