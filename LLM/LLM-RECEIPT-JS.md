# Ham Sandwich — receipt-js Integration Guide

> JavaScript behavior layer for animating receipt-style page transitions while staying compatible with `receipt-css`.

## Purpose

`receipt-js` adds motion behavior to the static receipt layout:

- Width transition when moving between narrow and wide receipt pages
- Vertical size transition when page height changes
- Top-to-bottom reveal of text/blocks in page order (line/block level, not character typing)
- Runtime customization via one settings file for timing, easing, thresholds, and selectors

This document defines how to use it safely across Ham Sandwich and future projects.

## Related Documents

| Document | Description |
|---|---|
| [LLM-RECEIPT-CSS.md](LLM-RECEIPT-CSS.md) | Styling layer and class usage expectations |
| [LLM-SITE.md](LLM-SITE.md) | Shared wrappers and shell conventions |
| [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) | Build/deploy behavior and sync constraints |

---

## Core Behaviors

### 1) Cross-page width continuity

When a user navigates between pages with different wrapper widths (for example `.receipt-wrapper` → `.receipt-wrapper-wide`):

- New page starts at the previous page width
- It animates to the new target width
- State is stored in `sessionStorage` for same-tab continuity

This creates a cohesive “receipt morph” experience between routes.

### 2) Resize-driven transitions

When viewport size changes and the wrapper width meaningfully changes:

- Width animates smoothly to new size
- Debounced observer prevents jitter loops

### 3) Vertical height transitions

When page/container height changes:

- Height animates from old size to new size
- Useful for responsive changes and dynamic content updates

### 4) Top-to-bottom line/block reveal

On page load:

- Visible text/blocks reveal in natural vertical order
- Container grows as items are revealed
- No character-by-character typewriter effect

---

## Integration Pattern (Ham Sandwich)

- `receipt-js` library source: `/receipt-js/receipt.js`
- `receipt-js` stylesheet: `/receipt-js/receipt-js.css` (imported by `/css/theme.css`)
- Global initialization path: `nav.js` loads the library and calls `ReceiptJS.init(...)`
- Wrapper target: `.site-shell` (fallback `.receipt-wrapper`)
- Single settings source: `/data/receipt-js.json`

Navigation handoff behavior:
- Current page width is saved before same-origin navigation
- New page prewarms wrapper width from session state
- New page then animates from previous width to current target width

Suggested defaults for this site:

- Width transitions: enabled
- Height transitions: optional (off by default in config)
- Line-by-line reveal: optional (off by default in config)
- Respect reduced motion preferences: enabled (mandatory)

Width handoff model (same approach as `qr-redirect-site`):
- Store current wrapper pixel width before same-origin navigation
- New page preloads wrapper at previous pixel width
- Animate `max-width` to page target width, then clear inline style

---

## Public API

```javascript
window.ReceiptJS.init({
  containerSelector: '.site-shell',
  enableWidthTransition: true,
  enableHeightTransition: true,
  enableLineReveal: true,
  widthTransitionDuration: 900,
  heightTransitionDuration: 760,
  lineRevealDuration: 520,
  lineStaggerMs: 120,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  minWidthDelta: 6,
  minHeightDelta: 12,
  debug: false
});
```

### Runtime reconfiguration

Primary location for project settings is `/data/receipt-js.json`.

Optional per-page overrides can still be injected before initialization:

```javascript
window.HamReceiptConfig = {
  enableHeightTransition: true,
  lineStaggerMs: 90
};
```

`nav.js` merges settings in this order:
1. Internal safety defaults
2. `/data/receipt-js.json`
3. `window.HamReceiptConfig` runtime overrides

So the single "nice place" to tune behavior is `/data/receipt-js.json`.

---

## Best Practices

### 1) Keep animation opt-in by behavior

- Width transitions are safe as default
- Height transitions are optional and should be enabled only where needed

### 2) Respect user preferences

- Disable transitions/reveal when `prefers-reduced-motion: reduce` is active
- This should be automatic in library defaults

### 3) Avoid CSS conflicts

- `receipt-js` should only set temporary inline transition/layout styles
- Do not hardcode theme colors, fonts, or shadows in JS
- Keep base reveal/pending classes in `/receipt-js/receipt-js.css`

### 4) Performance safeguards

- Debounce resize handling
- Use `ResizeObserver` where available
- Bail out when size deltas are below threshold values

### 5) Clean route-state handling

- Store only minimal session values (`last wrapper width`)
- Namespace keys to avoid collisions (`receipt-js:*`)

---

## Suggested Extra Effects (Optional)

These are intentionally optional to avoid scope creep:

1. **Tear-line settle**: tiny final Y-settle on wrapper at animation end
2. **Line-feed cadence mode**: configurable faster/slower reveal pacing per page
3. **Section reveal targeting**: animate only `.receipt-section > *` instead of all descendants
4. **Print intent mode**: trigger reveal only when page indicates printable/report-like content

If added, keep defaults conservative and provide toggles.

---

## Sync and Repository Workflow

Ham Sandwich should track `receipt-js` similarly to `receipt-css`:

- Local clone expected in `/receipt-js`
- Sync script attempts `git pull --ff-only` when `.git` exists
- Dev/build scripts call sync steps before serving/building

Commands:

```bash
npm run sync:receipt-js
npm run dev
npm run build
```

---

## Testing Checklist

1. Navigate between standard and wide pages:
   - `/` → `/links/`
   - `/chirp-csv/` → `/chirp-csv/directory/`
2. Resize window desktop ↔ mobile and verify smooth width transition
3. Confirm reduced motion mode disables animations
4. Verify no layout lock remains after transitions complete
5. Confirm first-load reveal appears top-to-bottom when enabled

---

## Guidance for Future LLM Tasks

When requesting receipt-js updates from an LLM:

1. Specify whether change is library-level (`/receipt-js`) or site-level init config (`/js/nav.js`)
2. Require compatibility with `receipt-css` wrappers and no visual token hardcoding
3. Require reduced-motion handling
4. Ask for thresholded transitions to avoid jitter
5. Ask for updates to this doc when API options change
