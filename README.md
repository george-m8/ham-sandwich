# Ham Sandwich

Static site scaffold for Ham Sandwich using `receipt-css`, designed for:
- Local development with Docker + Wrangler Pages dev
- Cloudflare Pages + Functions deployment
- Shared style + interaction layers via `receipt-css` and `receipt-js`

## Local run (without Docker)

```bash
npm install
npm run dev
```

Open `http://localhost:8788`.

`npm run dev` runs `npm run sync:receipt-css` first, which pulls latest upstream styles when `receipt-css` is a git clone.
`npm run dev` now runs `npm run sync:shared` first, which syncs both `receipt-css` and `receipt-js` when they are git clones.

## Local run (with Docker)

```bash
cp example.env .env
docker compose up --build
```

Open `http://localhost:8788`.

## Deploy target

This project is structured for Cloudflare Pages:
- Static routes in folders with `index.html`
- API endpoints in `functions/api/*`
- Shared middleware in `functions/_middleware.js`

## receipt-css updates

```bash
npm run sync:receipt-css
```

If `receipt-css` is a git clone, this pulls latest upstream CSS for all sites using that shared style source.

## receipt-js updates

```bash
npm run sync:receipt-js
```

If `receipt-js` is a git clone, this pulls latest upstream JS behavior helpers.

Site-wide animation/timing settings are in:

- `/data/receipt-js.json`

## Sync both shared repos

```bash
npm run sync:shared
```