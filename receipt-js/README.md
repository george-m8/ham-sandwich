# receipt-js (local workspace copy)

JavaScript behavior helpers for receipt-themed layouts.

This folder is intended to mirror a standalone `receipt-js` repository.

## In this project

- Single settings file: `/data/receipt-js.json`
- Stylesheet: `/receipt-js/receipt-js.css` (imported via `/css/theme.css`)

## Behaviors implemented

- Smooth narrow/wide width transitions
- Smooth vertical height transitions (optional)
- Top-to-bottom line/block reveal (optional)

Default site setup prioritizes width transitions for clean cross-page morphing.
## Sync workflow

Use:

```bash
npm run sync:receipt-js
```

If this folder is a git clone of your future repo, the sync script will run `git pull --ff-only`.
