# Ham Sandwich — Site Architecture & UI

> Site structure, page layouts, navigation, receipt-css integration, and configurable content.

## Related Documents

| Document | Description |
|---|---|
| [LLM-OVERVIEW.md](LLM-OVERVIEW.md) | High-level project overview |
| [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md) | CHIRP CSV generator feature |
| [LLM-TEST.md](LLM-TEST.md) | Test system feature |
| [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) | Hosting and deployment |
| [LLM-FIREBASE.md](LLM-FIREBASE.md) | Auth and data persistence |

---

## Styling — receipt-css

The entire site uses the **receipt-css** library for a monospace, receipt-themed aesthetic. This gives the site a distinctive, clean look fitting the technical radio hobby theme.

### Shared receipt-css Repository Workflow

`/receipt-css` is treated as the upstream style source for this and other projects:

- Source of truth: `/receipt-css/text.css`, `/receipt-css/layout.css`, `/receipt-css/inputs.css`
- Site-facing wrappers: `/css/text.css`, `/css/layout.css`, `/css/inputs.css` (thin `@import` bridge files)
- Project-specific overrides: `/css/theme.css`

This allows updates made in the local `receipt-css` repo clone to apply immediately to this site without duplicating style code.

### Shared receipt-js Repository Workflow

`/receipt-js` is treated as the upstream behavior source for receipt-style UI motion:

- Source of truth: `/receipt-js/receipt.js`
- Site integration: loaded globally from `/js/nav.js` using `ReceiptJS.init(...)`
- Site-wide options: `/data/receipt-js.json` (single primary settings file)
- Optional per-page overrides: `window.HamReceiptConfig` before init

This keeps receipt-style transitions reusable across projects without duplicating page-level animation code.

#### Build/Dev Sync Behavior

- Cloudflare Pages itself does **not** fetch `receipt-css` during build
- The repository must already contain `receipt-css/` content
- Local and CI workflows should run a sync step (`npm run sync:shared`) before dev/build to pull latest upstream shared changes when needed

### CSS Files to Include

```html
<link rel="stylesheet" href="/css/text.css">
<link rel="stylesheet" href="/css/layout.css">
<link rel="stylesheet" href="/css/inputs.css">
```

`/css/*.css` wrapper files import from `/receipt-css/*.css`, so templates stay stable while shared styles stay centrally managed.

### Key Classes Used Throughout

| Class | Purpose |
|---|---|
| `.receipt-wrapper` | Main content container (600px max) |
| `.receipt-wrapper-wide` | Wider container for directory/tables (720px) |
| `.receipt-header` | Page header with hash border decoration |
| `.receipt-footer` | Page footer with hash border decoration |
| `.receipt-section` | Content sections with padding |
| `.vertical-flex` / `.horizontal-flex` | Layout utilities |
| `.output-box` | Display generated content (CSV previews, test results) |
| `.dropdown` | Dropdown menus for LLM selection, filters |
| `.btn-box` | Primary action buttons |
| `.btn-secondary` | Secondary actions |
| `.form-row` / `.form-group` | Form layouts for CHIRP options and test answers |

### CSS Variable Overrides

Custom theme tweaks (if needed) go in a `theme.css` file:

```css
:root {
  --receipt-font: 'Courier New', Courier, monospace;
  --text-primary: #333;
  --container-sm: 600px;
}
```

### Theme Rules and Inline Style Policy

- Page-level inline styles are not used
- Any per-page spacing/layout tweaks belong in `/css/theme.css`
- Utility classes are preferred over one-off inline `style="..."` attributes

---

## Site Map

```
/                         → Homepage
/chirp-csv                → CHIRP CSV Generator
/chirp-csv/directory      → Public directory of generated CSVs
/test                     → Test launcher (choose mode)
/test/practice            → Practice test (immediate feedback)
/test/mock                → Timed mock exam
/test/retest              → Retest wrong answers
/links                    → Useful links page
/radios                   → Recommended radio directory
/account                  → User account (login/signup or profile)
/account/keys             → Manage saved API keys
/account/history          → Test history and saved CSVs
```

---

## Page Layouts

### Global Template

Every page shares a common structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ham Sandwich — {Page Title}</title>
  <link rel="stylesheet" href="/css/text.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="stylesheet" href="/css/inputs.css">
  <link rel="stylesheet" href="/css/theme.css">
</head>
<body>
  <div class="receipt-wrapper">
    <!-- Nav Bar -->
    <nav class="receipt-header" id="main-nav">
      <div class="horizontal-flex">
        <a href="/" class="nav-logo">🥪 Ham Sandwich</a>
        <div class="nav-links horizontal-flex">
          <a href="/chirp-csv">CHIRP CSV</a>
          <a href="/test">Tests</a>
          <a href="/radios">Radios</a>
          <a href="/links">Links</a>
          <a href="/account" id="account-link">Login</a>
        </div>
        <button class="btn-xs nav-toggle" aria-label="Menu">☰</button>
      </div>
    </nav>

    <!-- Page Content -->
    <main class="receipt-section" id="page-content">
      <!-- Page-specific content -->
    </main>

    <!-- Footer -->
    <footer class="receipt-footer">
      <p class="small-text">Ham Sandwich — Amateur Radio Tools</p>
      <div class="horizontal-flex gap-sm support-links" id="support-links">
        <!-- Dynamically populated from config -->
      </div>
      <p class="small-text light-text">© 2026</p>
    </footer>
  </div>

  <script src="/js/nav.js"></script>
  <script src="/js/config.js"></script>
  <script src="/js/auth.js"></script>
</body>
</html>
```

### Navigation Bar

The nav bar is responsive:

- **Desktop (>768px)**: Horizontal links displayed inline
- **Mobile (≤768px)**: Hamburger menu (`☰`) toggles a vertical dropdown

The account link dynamically updates:
- **Logged out**: Shows "Login" → links to `/account`
- **Logged in**: Shows username/icon → links to `/account` (which shows profile)

When logged out, the login CTA is rendered in button style in the nav and opens a modal overlay:

- Overlay dims/greys out the app background
- Modal appears above the current page (no full-page navigation)
- Closing modal returns user to current page state

Firebase integration behavior in modal:

- If Firebase SDK + config are available, email/password login is attempted through Firebase Auth
- If Firebase is unavailable (for local/offline/missing config), a clear fallback message is shown
- Fallback mode can still provide local placeholder login for development UI flow

Custom nav CSS additions (beyond receipt-css):

```css
.nav-logo {
  font-weight: bold;
  text-decoration: none;
  font-size: 1.1em;
}

.nav-links a {
  text-decoration: none;
  padding: 5px 10px;
}

.nav-links a:hover,
.nav-links a.active {
  text-decoration: underline;
  text-underline-offset: 4px;
}

.nav-toggle {
  display: none;
}

@media (max-width: 768px) {
  .nav-links {
    display: none;
    flex-direction: column;
    width: 100%;
  }
  .nav-links.open {
    display: flex;
  }
  .nav-toggle {
    display: inline-block;
  }
}
```

---

## Page Details

### 1. Homepage (`/`)

The landing page introduces Ham Sandwich and provides quick links to features.

```
┌──────────────────────────────────┐
│  🥪 Ham Sandwich                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                  │
│  Amateur Radio Tools             │
│  for Foundation Licence & Beyond │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 📻 CHIRP CSV Generator     │  │
│  │ Generate frequency lists   │  │
│  │ powered by AI              │  │
│  │         [Get Started →]    │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 📝 Foundation Licence Tests│  │
│  │ Practice UK amateur radio  │  │
│  │ exam questions             │  │
│  │         [Start Test →]     │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 📡 Recommended Radios      │  │
│  │ Browse our curated picks   │  │
│  │         [View Radios →]    │  │
│  └────────────────────────────┘  │
│                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ☕ Buy Me a Coffee | Links      │
└──────────────────────────────────┘
```

### 2. CHIRP CSV Generator (`/chirp-csv`)

Detailed in [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md). The page contains:

- LLM provider selector dropdown
- API key input (or "using saved key" indicator if logged in)
- Options form (frequency range, mode, repeaters, etc.)
- Prompt/description textarea
- Validation level selector
- Generate button
- Results area with CSV preview and download button

### 3. CSV Directory (`/chirp-csv/directory`)

A browsable, searchable directory of community-generated CSVs.

- **Filters**: Mode (FM/AM/DMR), frequency band, region/country, repeaters
- **Search**: Keyword search across CSV descriptions and content
- **Cards**: Each entry shows:
  - Title/description from the generation prompt
  - Frequency range covered
  - Number of entries
  - Date generated
  - Download button
  - Preview toggle

Uses `.receipt-wrapper-wide` for more table/card space.

### 4. Test System (`/test`, `/test/practice`, `/test/mock`, `/test/retest`)

Detailed in [LLM-TEST.md](LLM-TEST.md). The launcher page offers:

- **Practice Mode**: Immediate feedback, choose number of questions
- **Mock Exam Mode**: Timed, answers at the end
- **Retest Wrong Answers**: Review previously incorrect questions
- **Category Practice**: Focus on specific topic areas

### 5. Useful Links (`/links`)

A configurable page of external links relevant to amateur radio.

Content is driven by a JSON config file:

```json
{
  "linkGroups": [
    {
      "title": "Official Resources",
      "links": [
        {
          "name": "Ofcom",
          "url": "https://www.ofcom.org.uk",
          "description": "UK communications regulator"
        },
        {
          "name": "RSGB",
          "url": "https://rsgb.org",
          "description": "Radio Society of Great Britain"
        }
      ]
    },
    {
      "title": "Tools",
      "links": [
        {
          "name": "CHIRP",
          "url": "https://chirp.danplanet.com",
          "description": "Open-source radio programming tool"
        },
        {
          "name": "RepeaterBook",
          "url": "https://www.repeaterbook.com",
          "description": "Worldwide repeater directory"
        }
      ]
    },
    {
      "title": "Learning",
      "links": [
        {
          "name": "Essex Ham",
          "url": "https://www.essexham.co.uk",
          "description": "Foundation licence training resources"
        }
      ]
    }
  ]
}
```

This file (`/data/links.json`) can be updated without code changes.

UI spacing rules for links page:

- Link groups have vertical spacing between sections
- Link cards/items have vertical spacing between rows
- Footer/support links remain centered and legible

### 6. Recommended Radios (`/radios`)

A curated directory of recommended amateur radios.

Each entry is driven by a JSON config file (`/data/radios.json`):

```json
{
  "radios": [
    {
      "name": "Baofeng UV-5R",
      "image": "/images/radios/uv5r.jpg",
      "description": "Affordable dual-band handheld. Great starter radio for Foundation licence holders.",
      "bands": ["VHF", "UHF"],
      "price_range": "£20–£30",
      "price_min_gbp": 20,
      "price_max_gbp": 30,
      "affiliate_url": "https://example.com/affiliate/uv5r",
      "tags": ["handheld", "dual-band", "budget", "beginner"]
    }
  ]
}
```

`price_min_gbp` and `price_max_gbp` are the canonical numeric values for filtering and currency conversion.
`price_range` remains a display fallback string for legacy content.

Each radio card displays:
- Product image
- Name and description
- Bands supported
- Price range
- **[Buy →]** affiliate link button (`.btn-box`)
- Tags for filtering
- **[Read More →]** link for a richer product detail view on the same `/radios` route

`/radios` supports query params for route state:

- `?slug={radio-slug}` → product detail mode (read-more content)
- `?tags={tag1,tag2}` → multi-tag list filtering
- `?bands={band1,band2}` → multi-band list filtering
- `?q={search-term}` → list filtered by text search
- `?min={gbp-min}&max={gbp-max}` → numeric price-range filtering in GBP
- `?cur={currency-code}` → selected display currency (for UI conversion)

Legacy params `tag` and `band` are still accepted and normalized by `radios.js`.

Product detail mode (`/radios?slug=...`) includes:
- Long-form sections (blog-style content)
- Specification table
- Buy link
- Clickable tags that navigate to filtered list mode on `/radios`

Radios list filter UX includes:
- Multi-select tags with visible active states
- Multi-select bands (checkboxes)
- Min/max price dropdowns in 10-unit steps
- Active filter chips with per-chip remove actions
- Reset-all control
- Currency dropdown with country-based default (from `/api/location`) and rate conversion via `/api/rates`

Currency step sizing is JSON-configured in `/data/currency.json`:

```json
{
  "supported": ["GBP", "EUR", "USD", "CAD", "AUD", "JPY"],
  "step_multiplier": {
    "GBP": 1,
    "EUR": 1,
    "USD": 1,
    "CAD": 1,
    "AUD": 1,
    "JPY": 10
  }
}
```

Effective price-step size is `10 * step_multiplier` in selected currency.

### 7. Account Pages (`/account`, `/account/keys`, `/account/history`)

See [LLM-FIREBASE.md](LLM-FIREBASE.md) for auth details.

**`/account`** (logged out):
- Login form (email/password)
- Google sign-in button
- Sign-up link

**`/account`** (logged in):
- Username/email display
- Quick links to sub-pages
- Logout button

**`/account/keys`**:
- List of saved API keys (masked, e.g., `sk-...a3f9`)
- Add/remove keys per provider
- Keys are encrypted before storage — see [LLM-FIREBASE.md](LLM-FIREBASE.md)

**`/account/history`**:
- Test results history (date, score, categories)
- Saved/generated CSVs (date, description, download)

---

## Configurable Content System

Several pieces of site content should be easy to update without touching page HTML. These are managed through JSON config files in `/data/`:

| Config File | What It Controls |
|---|---|
| `/data/links.json` | Useful links page content |
| `/data/radios.json` | Recommended radio directory |
| `/data/currency.json` | Currency options and step multipliers for radios price controls |
| `/data/support.json` | Support/donation links (footer + links page) |
| `/data/site.json` | Site name, tagline, logo path, meta info |

### `/data/support.json`

```json
{
  "links": [
    {
      "name": "Buy Me a Coffee",
      "url": "https://buymeacoffee.com/your-handle",
      "icon": "☕",
      "display": "footer,links"
    },
    {
      "name": "GitHub",
      "url": "https://github.com/george-m8/ham-sandwich",
      "icon": "🐙",
      "display": "footer,links"
    },
    {
      "name": "QRZ.com",
      "url": "https://www.qrz.com/db/YOURCALL",
      "icon": "📻",
      "display": "links"
    }
  ]
}
```

The `display` field controls where each link appears:
- `"footer"` — shown in page footer
- `"links"` — shown on the useful links page
- `"footer,links"` — shown in both

### `/data/site.json`

```json
{
  "name": "Ham Sandwich",
  "tagline": "Amateur Radio Tools for Foundation Licence & Beyond",
  "logo": "🥪",
  "meta_description": "LLM-powered CHIRP frequency list generator and UK Foundation Licence mock tests",
  "copyright_year": "2026"
}
```

A `config.js` script loads these on page load and populates the relevant DOM elements, meaning updates to these JSON files are reflected across the site immediately on next deploy.

---

## JavaScript Architecture

```
/js/
├── config.js        # Loads /data/*.json, populates dynamic content
├── nav.js           # Mobile nav toggle, active link highlighting
├── firebase-config.js# Firebase init + availability detection + fallback state
├── auth.js          # Auth modal, Firebase login handling, auth state UI updates
├── chirp-csv.js     # CHIRP CSV generator logic (see LLM-CHIRP-CSV.md)
├── test.js          # Test system logic (see LLM-TEST.md)
├── directory.js     # CSV directory filtering and search
├── radios.js        # Radio list, filters, tags, and read-more detail mode
└── utils.js         # Shared utilities (fetch wrappers, DOM helpers)
```

### Auth State Integration

`auth.js` listens to Firebase auth state changes and:
1. Updates the nav bar account link text
2. Exposes `window.currentUser` for other scripts to check
3. Loads user-specific data (saved keys, test history) when logged in
4. Clears user-specific UI when logged out

See [LLM-FIREBASE.md](LLM-FIREBASE.md) for the Firebase Auth setup.

---

## UI Patterns

### Login-Gated Action Pattern

For actions that require authentication (for example favouriting a CSV or loading historical wrong answers), use a consistent UI pattern across the site:

- Always render the action control (do not hide it for logged-out users)
- When logged out, visually dim the control and show a tooltip on hover
- On click while logged out, open the login modal/page and include the action label in the prompt text
- Use `data-auth-action="{action description}"` on the control so shared auth logic can render contextual messaging

Example:

```html
<button class="btn-secondary" data-auth-action="add this to your favourites">
  ★ Favourite
</button>
```

`auth.js` should attach a delegated click handler for elements with `data-auth-action` to keep behaviour consistent across pages.

### Placeholder Text Policy

Placeholder labels should match the feature area and should not be generic:

- CHIRP generator: `CHIRP CSV GENERATOR MODULE HERE`
- CHIRP CSV preview/listing modules: `CSV DIRECTORY/PREVIEW MODULE HERE`
- Test pages: `TEST MODULE HERE`
- Account pages: `ACCOUNT KEYS MODULE HERE`, `ACCOUNT HISTORY MODULE HERE`

---

## File Structure

```
/
├── index.html                  # Homepage
├── chirp-csv/
│   ├── index.html              # CHIRP CSV Generator
│   └── directory/
│       └── index.html          # CSV Directory
├── test/
│   ├── index.html              # Test launcher
│   ├── practice.html           # Practice mode
│   ├── mock.html               # Mock exam mode
│   └── retest.html             # Retest wrong answers
├── links/
│   └── index.html              # Useful links
├── radios/
│   └── index.html              # Recommended radios
├── account/
│   ├── index.html              # Login / profile
│   ├── keys.html               # API key management
│   └── history.html            # Test & CSV history
├── css/
│   ├── text.css                # wrapper importing /receipt-css/text.css
│   ├── layout.css              # wrapper importing /receipt-css/layout.css
│   ├── inputs.css              # wrapper importing /receipt-css/inputs.css
│   └── theme.css               # Custom overrides
├── receipt-css/                # shared style repo clone (upstream source)
│   ├── text.css
│   ├── layout.css
│   ├── inputs.css
│   └── ...
├── js/
│   ├── config.js
│   ├── nav.js
│   ├── firebase-config.js
│   ├── auth.js
│   ├── chirp-csv.js
│   ├── test.js
│   ├── directory.js
│   ├── radios.js
│   └── utils.js
├── data/
│   ├── site.json
│   ├── links.json
│   ├── radios.json
│   ├── support.json
│   └── questions/              # Test question banks
│       ├── licensing-and-regulations.json
│       ├── propagation.json
│       ├── safety.json
│       └── ...
├── images/
│   └── radios/
│       └── ...
└── functions/                  # Cloudflare Pages Functions (see LLM-CLOUDFLARE.md)
  ├── api/
  │   ├── llm.js
  │   └── ...
  └── _middleware.js
```

---

## Accessibility & Performance

- All interactive elements have appropriate `aria-*` labels
- Colour contrast ratios meet WCAG AA against receipt-css defaults (dark text on white paper background)
- Images in radio directory use `loading="lazy"` and have `alt` text
- No heavy JS frameworks — vanilla JS keeps bundle size minimal
- JSON config files and question banks can be cached aggressively via Cloudflare
