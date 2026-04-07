# Ham Sandwich — Project Overview

> A web platform for amateur radio enthusiasts featuring LLM-powered CHIRP frequency list generation and UK Foundation Licence mock testing.

## Related Documents

| Document | Description |
|---|---|
| [LLM-SITE.md](LLM-SITE.md) | Site architecture, pages, navigation, and UI |
| [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md) | CHIRP CSV generator — LLM integration and workflow |
| [LLM-WORKBENCH-DASHBOARD.md](LLM-WORKBENCH-DASHBOARD.md) | Future dashboard/workbench architecture and migration plan |
| [LLM-TEST.md](LLM-TEST.md) | Amateur Radio Foundation Licence mock test system |
| [LLM-FIREBASE.md](LLM-FIREBASE.md) | Firebase setup — auth, database, and storage |
| [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) | Cloudflare Pages/Workers hosting and deployment |
| [LLM-DOCKER.md](LLM-DOCKER.md) | Docker configuration for local dev and deployment |
| [LLM-RECEIPT-CSS.md](LLM-RECEIPT-CSS.md) | receipt-css usage, update flow, and best practices |
| [LLM-RECEIPT-JS.md](LLM-RECEIPT-JS.md) | receipt-js behaviors, API, and integration guidance |
| [example.env](../example.env) | Environment variable template — copy to `.env` and fill in values |

---

## What Is Ham Sandwich?

Ham Sandwich is a web application for amateur (ham) radio operators. It provides two main tools:

1. **CHIRP CSV Generator** — An LLM-powered tool that generates interesting, curated frequency lists formatted as CHIRP-compatible CSV files. Users provide their preferences (location, band, mode, repeater interest, etc.) and an LLM produces a tailored frequency list ready to import into CHIRP and upload to their radios.

2. **Foundation Licence Mock Tests** — A question-and-answer system for UK Amateur Radio Foundation Licence exam preparation. Users answer multiple-choice questions, get immediate feedback with explanations, and track their progress over time.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                      │
│              (Static site + Workers API)                 │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Homepage  │  │  CHIRP CSV   │  │   Test System     │  │
│  │ Nav / Links│ │  Generator   │  │   (Mock Exams)    │  │
│  └──────────┘  └──────┬───────┘  └────────┬──────────┘  │
│                        │                    │             │
│  ┌─────────────────────┴────────────────────┘            │
│  │         Cloudflare Workers (API Layer)                │
│  │  • Proxy LLM requests (hide keys client-side)        │
│  │  • Location detection (CF headers / IP fallback)     │
│  │  • CSV validation & storage triggers                 │
│  └──────────────────────┬───────────────────┘            │
└─────────────────────────┼───────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐  ┌──────▼──────┐  ┌────▼────┐
    │  Firebase  │  │ LLM APIs    │  │ receipt │
    │  Auth      │  │ (OpenAI,    │  │  -css   │
    │  Firestore │  │  Gemini,    │  │ (style) │
    │  Storage   │  │  Claude,    │  └─────────┘
    │            │  │  Grok)      │
    └────────────┘  └─────────────┘
```

## Core Features Summary

### Site & UI — [LLM-SITE.md](LLM-SITE.md)
- Styled with **receipt-css** (monospace receipt-themed aesthetic)
- Uses shared `/receipt-css` repo files as style source via `/css/*` import wrappers
- Includes sync workflow for shared styles via `npm run sync:receipt-css`
- Responsive, accessible, clean navigation bar
- Nav login uses a modal overlay (greyed background) instead of forced page navigation
- Firebase-auth-aware login flow with clear local/offline fallback messaging
- Homepage with feature overview and call-to-action links
- Useful links page with configurable external links (Buy Me a Coffee, socials, etc.)
- Recommended radio directory with images, descriptions, affiliate links, multi-select tags/bands, and active filter chips
- Radios read-more detail mode on `/radios?slug=...` with long-form sections and specs tables
- Price filtering via min/max dropdowns with numeric GBP schema backing
- Currency selector with Cloudflare-country default and live conversion rates
- Currency step sizing controlled by `/data/currency.json` (`step_multiplier`, default `x1`)
- Hosted on **Cloudflare Pages** with Workers for API endpoints

### CHIRP CSV Generator — [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md)
- Multi-provider LLM support via **Pydantic AI** (OpenAI, Gemini, Claude, Grok)
- User brings their own API key (stored in Firebase if logged in)
- Configurable options: frequency range, mode (FM/AM/DMR), repeaters, location
- Smart prompt construction combining user preferences with structured requirements
- JSON response parsing with optional multi-level validation
- Deduplication (by Name + Frequency combined)
- CSV download and server-side storage for community directory
- Public directory of generated CSVs with filtering and keyword search

### Test System — [LLM-TEST.md](LLM-TEST.md)
- UK Amateur Radio Foundation Licence multiple-choice questions
- Immediate feedback with correct answer and explanation
- Wrong answer tracking and batch retesting
- Categorised questions for targeted revision
- Spaced repetition system for logged-in users (wrong answers appear more frequently)
- Timed mock exam mode (answers revealed at end)
- Progress persistence via Firebase for logged-in users

### Firebase — [LLM-FIREBASE.md](LLM-FIREBASE.md)
- **Authentication**: Email/password and Google sign-in
- **Firestore**: User profiles, saved API keys (encrypted), test results, generated CSVs
- **Security Rules**: Per-user data isolation, public read for CSV directory

### Cloudflare — [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md)
- **Pages**: Static site hosting with Git-based deployments
- **Workers**: API layer for LLM proxying, geolocation, and server-side logic
- **Custom domain** configuration and SSL

### Docker — [LLM-DOCKER.md](LLM-DOCKER.md)
- Local development environment mirroring production
- Firebase emulator suite integration
- Miniflare for local Cloudflare Workers emulation

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS (receipt-css), vanilla JS |
| CSS Framework | receipt-css (custom monospace/receipt theme) |
| API Layer | Cloudflare Workers |
| LLM Orchestration | Pydantic AI (Python, running in Worker or proxied) |
| Authentication | Firebase Auth |
| Database | Firebase Firestore |
| Hosting | Cloudflare Pages |
| Local Dev | Docker + Firebase Emulators + Miniflare |
| LLM Providers | OpenAI, Google Gemini, Anthropic Claude, xAI Grok |

## Development Phases

### Phase 1 — Foundation
1. Set up Cloudflare Pages project and custom domain — see [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md)
2. Set up Firebase project (Auth + Firestore) — see [LLM-FIREBASE.md](LLM-FIREBASE.md)
3. Set up Docker local dev environment — see [LLM-DOCKER.md](LLM-DOCKER.md)
4. Build site skeleton with receipt-css: homepage, nav, footer — see [LLM-SITE.md](LLM-SITE.md)

### Phase 2 — CHIRP CSV Generator
5. Build CHIRP CSV generator UI (options form, prompt input) — see [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md)
6. Implement Cloudflare Worker for LLM proxying
7. Implement response parsing, validation, deduplication
8. CSV generation and download
9. Firebase storage for generated CSVs
10. Public CSV directory with filters and search

### Phase 3 — Test System
11. Create question bank in JSON format — see [LLM-TEST.md](LLM-TEST.md)
12. Build test-taking UI with immediate feedback
13. Implement wrong answer tracking and retesting
14. Add category tagging and revision recommendations
15. Implement spaced repetition for logged-in users
16. Add timed mock exam mode

### Phase 4 — Polish & Extras
17. Useful links page and recommended radio directory
18. Buy Me a Coffee / support links integration
19. Performance optimisation and security hardening
20. User testing and bug fixes

## Security Principles

- **API keys never touch the client in transit** — LLM requests are proxied through Cloudflare Workers
- **User API keys encrypted at rest** in Firestore — see [LLM-FIREBASE.md](LLM-FIREBASE.md)
- **Firebase Security Rules** enforce per-user data isolation
- **HTTPS everywhere** via Cloudflare
- **Input sanitisation** on all user-provided prompts before sending to LLMs
- **Rate limiting** on Worker endpoints to prevent abuse
- **Environment variables** managed via [example.env](../example.env) — never commit real `.env` files
- **Structured logging with redaction**: use JSON logs with request IDs; never log API keys, auth tokens, raw CSV payloads, or full user prompts (see [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) and [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md))
