# Ham Sandwich — Cloudflare Setup

> Cloudflare Pages hosting, Workers API layer, domain configuration, and deployment pipeline.

## Related Documents

| Document | Description |
|---|---|
| [LLM-OVERVIEW.md](LLM-OVERVIEW.md) | High-level project overview |
| [LLM-SITE.md](LLM-SITE.md) | Site architecture and file structure |
| [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md) | CHIRP CSV generator — Worker handles LLM proxying |
| [LLM-FIREBASE.md](LLM-FIREBASE.md) | Firebase — Cloudflare interacts with Firestore |
| [LLM-DOCKER.md](LLM-DOCKER.md) | Local dev with Miniflare |

---

## Why Cloudflare?

- **Cloudflare Pages**: Free static site hosting with Git-based deployments, preview URLs per branch, and generous bandwidth
- **Cloudflare Workers**: Serverless functions at the edge — ideal for proxying LLM API requests without exposing keys, geolocation headers, and rate limiting
- **Global CDN**: Assets cached at the edge worldwide, fast for all users
- **Free SSL**: Automatic HTTPS on custom domains
- **`request.cf` object**: Built-in geolocation data (country, city, region) — no extra API calls needed for location detection (see [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md))

---

## Architecture

```
                    ┌──────────────────────┐
                    │   Cloudflare CDN     │
                    │   (Global Edge)      │
                    └────┬────────────┬────┘
                         │            │
              Static     │            │  API Routes
              Assets     │            │  (/api/*)
                         │            │
                    ┌────▼────┐  ┌────▼──────────┐
                    │  Pages  │  │    Workers     │
                    │ (HTML,  │  │  (Serverless)  │
                    │  CSS,   │  │                │
                    │  JS,    │  │ • /api/llm     │
                    │  JSON)  │  │ • /api/location│
                    │         │  │ • /api/rates   │
                    └─────────┘  └────────────────┘
```

---

## Human Setup Steps

### 1. Create Cloudflare Account

1. Go to [cloudflare.com](https://www.cloudflare.com/) and sign up (free plan is fine)
2. Verify your email

### 2. Connect Git Repository

1. In Cloudflare Dashboard, go to **Workers & Pages**
2. Click **Create application** → **Pages** → **Connect to Git**
3. Authorise Cloudflare to access your GitHub account
4. Select the `ham-sandwich` repository
5. Configure build settings:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm run sync:receipt-css` (optional) or empty if `receipt-css/` is already committed |
| Build output directory | `/` (root, or `/site` if we separate site files) |
| Root directory | `/` |

6. Click **Save and Deploy**

> **Note**: If we add a build step later (e.g., for bundling JS), update the build command accordingly. For now, the site is plain HTML/CSS/JS with no build tooling.

Important: Cloudflare Pages does not automatically clone external style repositories. If `receipt-css/` is not committed in the repo, use a build command/script that fetches or syncs it before publish.

Static asset note for shared styles:

- `/receipt-css/*.css` is the shared style source repository content
- `/css/*.css` files are thin wrappers using `@import` to those shared files
- `/css/theme.css` remains project-specific overrides

### 3. Set Up Custom Domain (Optional)

1. In the Pages project settings, go to **Custom domains**
2. Click **Set up a custom domain**
3. Enter your domain (e.g., `ham-sandwich.com`)
4. If the domain is already on Cloudflare:
   - DNS records are added automatically
5. If the domain is elsewhere:
   - Add the CNAME record Cloudflare provides to your DNS
   - Or transfer the domain to Cloudflare for easier management
6. SSL certificate is provisioned automatically

### 4. Configure Workers

Cloudflare Pages uses the **Functions** directory structure for server-side routes.

#### Directory-based routing:

```
functions/
├── api/
│   ├── llm.js          → POST /api/llm
│   ├── location.js     → GET  /api/location
│   ├── rates.js        → GET  /api/rates
│   └── csv/
│       ├── upload.js    → POST /api/csv/upload
│       └── index.js     → GET  /api/csv (directory listing)
└── _middleware.js       → Runs on all /api/* routes
```

> **Important**: Cloudflare Pages Functions use the `functions/` directory (not `_workers/`). The directory name maps directly to URL paths.

### 5. Set Worker Secrets (Environment Variables)

Some Worker functionality requires secrets. Set these via the Cloudflare Dashboard or Wrangler CLI:

```bash
# Install Wrangler CLI
npm install -g wrangler
wrangler login

# Set secrets
wrangler pages secret put ENCRYPTION_SALT
# Enter a random string used for server-side encryption operations
```

> **Note**: `RATE_LIMITS` is a KV binding, not a secret. Configure it in **Settings → Functions → KV namespace bindings** (see next section).

Or via Dashboard:
1. Go to **Workers & Pages** → your Pages project → **Settings** → **Environment variables**
2. Add variables for Production and Preview environments

### 6. Set Up KV Namespace for Rate Limiting

1. In Cloudflare Dashboard, go to **Workers & Pages** → **KV**
2. Create a new namespace: `HAM_SANDWICH_RATE_LIMITS`
3. In your Pages project settings, go to **Settings** → **Functions** → **KV namespace bindings**
4. Add binding:
   - Variable name: `RATE_LIMITS`
   - KV namespace: `HAM_SANDWICH_RATE_LIMITS`

---

## Workers Implementation

### Middleware: `functions/_middleware.js`

Handles CORS, rate limiting, and shared logic for all API routes.

```javascript
export async function onRequest(context) {
  const { request, next, env } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting (simple IP-based)
  const clientIP = request.headers.get('CF-Connecting-IP');
  const rateLimitKey = `rate:${clientIP}:${new URL(request.url).pathname}`;

  if (env.RATE_LIMITS) {
    const current = await env.RATE_LIMITS.get(rateLimitKey);
    const count = current ? parseInt(current) : 0;

    if (count >= 10) { // 10 requests per minute
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await env.RATE_LIMITS.put(rateLimitKey, String(count + 1), { expirationTtl: 60 });
  }

  // Continue to route handler
  const response = await next();

  // Add CORS headers to response
  const newResponse = new Response(response.body, response);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });

  return newResponse;
}
```

### LLM Proxy: `functions/api/llm.js`

Proxies LLM requests from the client to the selected provider. The user's API key is passed through but never stored.

```javascript
const PROVIDER_CONFIGS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    authHeader: (key) => `Bearer ${key}`,
    formatRequest: (prompt, model) => ({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
    extractResponse: (data) => data.choices[0].message.content,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.0-flash',
    authHeader: null, // Uses query param
    formatRequest: (prompt, model) => ({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
    extractResponse: (data) => data.candidates[0].content.parts[0].text,
  },
  claude: {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514',
    authHeader: (key) => key, // x-api-key header
    formatRequest: (prompt, model) => ({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
    extractResponse: (data) => data.content[0].text,
  },
  grok: {
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-3',
    authHeader: (key) => `Bearer ${key}`,
    formatRequest: (prompt, model) => ({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
    extractResponse: (data) => data.choices[0].message.content,
  },
};

export async function onRequestPost(context) {
  const { request } = context;

  try {
    const body = await request.json();
    const { provider, api_key, prompt, model: requestedModel } = body;

    if (!provider || !api_key || !prompt) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: provider, api_key, prompt' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      return new Response(
        JSON.stringify({ error: `Unknown provider: ${provider}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const model = requestedModel || config.model;

    // Build provider-specific request
    let url = config.baseUrl;
    const headers = { 'Content-Type': 'application/json' };

    if (provider === 'gemini') {
      url = `${config.baseUrl}/${model}:generateContent?key=${api_key}`;
    } else if (provider === 'claude') {
      headers['x-api-key'] = api_key;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = config.authHeader(api_key);
    }

    const requestBody = config.formatRequest(prompt, model);

    // Make the request to the LLM provider
    const llmResponse = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      return new Response(
        JSON.stringify({
          error: `LLM provider returned ${llmResponse.status}`,
          details: errorText,
        }),
        { status: llmResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const llmData = await llmResponse.json();
    const content = config.extractResponse(llmData);

    return new Response(
      JSON.stringify({ content }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Location Endpoint: `functions/api/location.js`

Returns the user's detected location using Cloudflare's built-in geolocation.

```javascript
export async function onRequestGet(context) {
  const { request } = context;

  const cf = request.cf || {};

  const location = {
    country: cf.country || request.headers.get('CF-IPCountry') || 'Unknown',
    city: cf.city || 'Unknown',
    region: cf.region || 'Unknown',
    latitude: cf.latitude || null,
    longitude: cf.longitude || null,
    timezone: cf.timezone || 'UTC',
  };

  return new Response(
    JSON.stringify(location),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
```

`/api/location` country is used by the radios UI to choose a default display currency.

### Rates Endpoint: `functions/api/rates.js`

Provides exchange rates (default base `GBP`) for the radios currency selector.

Example request:

`GET /api/rates?base=GBP&symbols=USD,EUR,CAD`

Example response:

```json
{
  "base": "GBP",
  "date": "2026-03-30",
  "rates": {
    "USD": 1.27,
    "EUR": 1.17,
    "CAD": 1.72,
    "GBP": 1
  }
}
```

Implementation notes:
- Uses an external rates provider server-side from the Worker (not directly from browser)
- Returns `GBP: 1` always
- Falls back to conservative static rates if upstream is unavailable

### CSV Upload: `functions/api/csv/upload.js`

Handles CSV upload to Firebase Storage and creates a directory entry in Firestore.

> **Note**: Auth is optional for this route. Anonymous generations are allowed and stored with `created_by: null`. If an `Authorization: Bearer <idToken>` header is present, the token is verified and `created_by` is set to that user UID.

> **Note**: This Worker needs Firebase Admin SDK access. Since Cloudflare Workers don't natively support the Node.js Firebase Admin SDK, we use the Firebase REST API instead.

```javascript
export async function onRequestPost(context) {
  const { request, env } = context;

  // Optional Firebase auth token (passed in Authorization header)
  const authHeader = request.headers.get('Authorization');
  let userId = null;

  if (authHeader?.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1];

    // Verify token with Firebase Auth REST API
    const verifyResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!verifyResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userData = await verifyResponse.json();
    userId = userData.users[0].localId;
  }

  // Process the CSV upload...
  const body = await request.json();
  const { csv_content, metadata, title, description } = body;

  // Upload CSV to Firebase Storage via REST API
  // Create directory entry in Firestore via REST API
  // Set created_by to userId (logged-in) or null (anonymous)
  // ... (implementation details)

  return new Response(
    JSON.stringify({ success: true, csvId: 'generated-id' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
```

---

## Environment Variables

All environment variables are documented in [example.env](../example.env). Copy it to `.env` for local development. For production, set these in Cloudflare Dashboard under **Workers & Pages** → Project → **Settings** → **Environment variables**:

| Variable | Environment | Description |
|---|---|---|
| `FIREBASE_API_KEY` | Production + Preview | Firebase Web API key (for token verification) |
| `FIREBASE_PROJECT_ID` | Production + Preview | Firebase project ID |
| `ENCRYPTION_SALT` | Production only | Salt for any server-side encryption |

For local development, Wrangler reads from the `.env` file automatically. The full list of variables (including Firebase emulator hosts and geolocation defaults) is in [example.env](../example.env).

> **Important**: The Firebase API key here is the same public key used in the client-side config. It's used by the Worker to verify auth tokens via the Firebase REST API. This is safe — Firebase Security Rules protect data access, not the API key.

---

## Deployment

### Automatic Deployment

With Git integration configured, every push to `main` triggers a production deployment:

```bash
git add -A
git commit -m "feat: add CHIRP CSV generator"
git push origin main
# → Cloudflare Pages automatically builds and deploys
```

Pushes to other branches create **preview deployments** with unique URLs (e.g., `feature-branch.ham-sandwich.pages.dev`).

### Manual Deployment via Wrangler

```bash
# Deploy Pages
wrangler pages deploy ./ --project-name ham-sandwich

# Or deploy just Workers functions for testing
wrangler pages dev ./  --port 8788
```

### Local Development

For local development with Wrangler (simulates Pages + Workers locally):

```bash
# Start local dev server with Workers support
wrangler pages dev ./ --port 8788 --live-reload
```

This provides:
- Static file serving
- Workers function execution
- `request.cf` object simulation (with mock geolocation data)
- Live reload on file changes

See [LLM-DOCKER.md](LLM-DOCKER.md) for running this inside Docker alongside Firebase emulators.

---

## Caching Strategy

### Static Assets

Cloudflare Pages automatically caches static assets at the edge. Default behaviour is good for most files. Add a `_headers` file in the root for custom cache headers:

```
# _headers

/css/*
  Cache-Control: public, max-age=31536000, immutable

/js/*
  Cache-Control: public, max-age=86400

/data/questions/*
  Cache-Control: public, max-age=3600

/data/links.json
  Cache-Control: public, max-age=3600

/data/radios.json
  Cache-Control: public, max-age=3600

/images/*
  Cache-Control: public, max-age=604800
```

| Path | Cache Duration | Reason |
|---|---|---|
| `/css/*` | 1 year (immutable) | CSS files change rarely; cache-bust via filename if needed |
| `/js/*` | 1 day | JS may update more frequently |
| `/data/questions/*` | 1 hour | Question banks may be updated |
| `/data/*.json` | 1 hour | Config files may be updated |
| `/images/*` | 1 week | Images change rarely |

### API Responses

Worker API responses should NOT be cached (they contain user-specific data):

```
/api/*
  Cache-Control: no-store, no-cache, must-revalidate
```

### CSV Directory Caching

The CSV directory listing can be cached at the edge for short periods since it's public data:

```javascript
// In functions/api/csv/index.js
return new Response(JSON.stringify(directoryEntries), {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300', // 5 minutes
  },
});
```

---

## Redirects and Rewrites

Add a `_redirects` file for any URL redirects:

```
# _redirects

# Clean URLs (optional — Pages handles this by default for index.html files)
/chirp-csv/*  /chirp-csv/index.html  200
/test/*       /test/index.html       200
```

If doing client-side routing in the future (SPA-style), add:
```
/*  /index.html  200
```

---

## Monitoring and Analytics

### Cloudflare Analytics

- Built into the dashboard for Pages projects
- Shows requests, bandwidth, status codes, countries
- No additional setup needed

### Worker Analytics

- Go to **Workers & Pages** → your project → **Analytics**
- Shows Worker invocations, errors, CPU time
- Set up **Logpush** for persistent Worker logs if needed

### Error Alerting

1. Go to **Notifications** in Cloudflare Dashboard
2. Create an alert for:
   - **Workers failure rate** > 5%
   - **Pages deployment failure**
3. Set notification method (email, webhook, etc.)

### Worker Logging Practices

Use structured JSON logs for all API routes. Each log entry should include:

- `timestamp`
- `level` (`debug`/`info`/`warn`/`error`)
- `event` (short event name, e.g. `llm_request_start`)
- `request_id` (prefer `CF-Ray` header value)
- `route` and `method`
- `provider` (for LLM calls), `status_code`, `duration_ms`

Never log:

- API keys or auth tokens (`Authorization`, `api_key`, Firebase ID token)
- Raw prompt text or full model responses
- Full CSV payload content

Instead, log safe summaries:

- Prompt length and selected options (mode, band, validation level)
- Number of channels returned/accepted/rejected
- Error category (`provider_error`, `validation_error`, `auth_error`, etc.)

Example Worker helper:

```javascript
function logEvent(level, event, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    request_id: context.request_id || null,
    route: context.route || null,
    method: context.method || null,
    provider: context.provider || null,
    status_code: context.status_code || null,
    duration_ms: context.duration_ms || null,
    error_code: context.error_code || null,
  };
  console.log(JSON.stringify(entry));
}
```

Log levels by environment:

- **Production**: `info`, `warn`, `error`
- **Preview/Local**: `debug` enabled for troubleshooting

Retention and access:

- Keep high-volume request logs for 14–30 days
- Restrict log access to project maintainers only
- Use longer retention only for aggregated metrics, not raw request traces

---

## Cost Considerations

| Resource | Free Tier | Notes |
|---|---|---|
| Pages | Unlimited sites, 500 builds/month | More than sufficient |
| Workers | 100K requests/day | LLM proxy + location calls |
| KV | 100K reads/day, 1K writes/day | Rate limiting storage |
| Bandwidth | Unlimited | Pages has unlimited bandwidth |

For a hobby project, the free tier covers everything comfortably. The main thing to watch is Worker invocations if the CHIRP CSV generator becomes popular.
