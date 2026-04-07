# Ham Sandwich — Docker Setup

> Docker configuration for local development, testing, and portability.

## Related Documents

| Document | Description |
|---|---|
| [LLM-OVERVIEW.md](LLM-OVERVIEW.md) | High-level project overview |
| [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) | Production hosting — what Docker emulates locally |
| [LLM-FIREBASE.md](LLM-FIREBASE.md) | Firebase — emulated locally via Docker |

---

## Can Docker Be Used?

**Yes — Docker is a great fit for local development.** Here's the breakdown:

| Use Case | Docker Suitability | Notes |
|---|---|---|
| **Local development** | ✅ Excellent | Bundle the dev server, Firebase emulators, and Miniflare into one `docker-compose` setup |
| **CI/CD testing** | ✅ Good | Run tests and linting in containers |
| **Cloudflare deployment** | ❌ Not applicable | Cloudflare Pages/Workers are deployed via Git push or Wrangler CLI — you can't "run" Cloudflare Workers in your own Docker container in production. The deployment target is Cloudflare's edge network, not a traditional server. |
| **Self-hosted alternative** | ⚠️ Possible but not recommended | You *could* run the site from a Docker container on your own server (using a Node.js static server + an Express/Hono API layer instead of Workers), but you'd lose Cloudflare's edge caching, geolocation, and free hosting. Not worth the effort unless you specifically want a self-hosted option. |

**Recommendation**: Use Docker for **local development only**. Deploy to Cloudflare Pages/Workers for production. Docker gives you a reproducible, isolated dev environment that closely mirrors production behaviour.

---

## Local Development Architecture

```
docker-compose up
    │
    ├── ham-sandwich-app (Container 1)
    │   ├── Wrangler Pages Dev Server (port 8788)
    │   │   ├── Serves static files (HTML, CSS, JS, JSON)
    │   │   ├── Runs Workers functions locally via Miniflare
    │   │   └── Simulates request.cf geolocation object
    │   └── File watcher for live reload
    │
    └── firebase-emulators (Container 2)
        ├── Auth Emulator (port 9099)
        ├── Firestore Emulator (port 8080)
        ├── Storage Emulator (port 9199)
        └── Emulator UI (port 4000)
```

---

## Docker Files

### `Dockerfile`

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install Wrangler CLI and Firebase CLI
RUN npm install -g wrangler firebase-tools

# Copy package files first (for caching)
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose Wrangler dev server port
EXPOSE 8788

# Default command: start Wrangler Pages dev server
CMD ["npm", "run", "dev"]
```

`npm run dev` runs a pre-step (`npm run sync:receipt-css`) so shared styles can be refreshed before serving.

### `Dockerfile.firebase`

A separate Dockerfile for the Firebase emulators (they need Java):

```dockerfile
FROM node:20-slim

# Install Java (required for Firebase emulators)
RUN apt-get update && \
    apt-get install -y --no-install-recommends default-jre-headless && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Firebase CLI
RUN npm install -g firebase-tools

# Copy Firebase config files
COPY firebase.json .
COPY firestore.rules .
COPY firestore.indexes.json .
COPY storage.rules .
COPY .firebaserc .

# Download emulators
RUN firebase setup:emulators:firestore && \
    firebase setup:emulators:storage && \
    firebase setup:emulators:auth

# Expose emulator ports
EXPOSE 9099 8080 9199 4000

# Start emulators
CMD ["firebase", "emulators:start", "--only", "auth,firestore,storage", "--project", "ham-sandwich"]
```

### `docker-compose.yml`

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8788:8788"
    volumes:
      # Mount source code for live reload
      - ./:/app
      # Prevent overwriting node_modules
      - /app/node_modules
    env_file:
      - .env
    environment:
      - NODE_ENV=development
      # Override emulator hosts to use Docker service names
      # (base values are in .env — see example.env for template)
      - FIREBASE_AUTH_EMULATOR_HOST=firebase:9099
      - FIRESTORE_EMULATOR_HOST=firebase:8080
      - FIREBASE_STORAGE_EMULATOR_HOST=firebase:9199
    depends_on:
      firebase:
        condition: service_healthy
    networks:
      - ham-net

  firebase:
    build:
      context: .
      dockerfile: Dockerfile.firebase
    ports:
      - "9099:9099"   # Auth emulator
      - "8080:8080"   # Firestore emulator
      - "9199:9199"   # Storage emulator
      - "4000:4000"   # Emulator UI
    volumes:
      # Persist emulator data between restarts
      - firebase-data:/app/.firebase-emulator-data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - ham-net

volumes:
  firebase-data:

networks:
  ham-net:
    driver: bridge
```

### `.dockerignore`

```
node_modules
.git
.gitignore
*.md
LLM/
.firebase
.firebaserc
```

---

## Firebase Configuration Files

These files are needed by the Firebase emulators. Create them in the project root.

### `firebase.json`

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "emulators": {
    "auth": {
      "port": 9099,
      "host": "0.0.0.0"
    },
    "firestore": {
      "port": 8080,
      "host": "0.0.0.0"
    },
    "storage": {
      "port": 9199,
      "host": "0.0.0.0"
    },
    "ui": {
      "enabled": true,
      "port": 4000,
      "host": "0.0.0.0"
    }
  }
}
```

### `.firebaserc`

```json
{
  "projects": {
    "default": "ham-sandwich"
  }
}
```

### `firestore.rules` and `storage.rules`

Use the rules defined in [LLM-FIREBASE.md](LLM-FIREBASE.md). Copy them into the root-level files:
- `firestore.rules` — Firestore Security Rules
- `storage.rules` — Firebase Storage Rules
- `firestore.indexes.json` — Firestore Indexes

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
- Git repository cloned

### First-Time Setup

```bash
# Clone the repository
git clone https://github.com/george-m8/ham-sandwich.git
cd ham-sandwich

# Create a minimal package.json if not present
npm init -y
npm install wrangler --save-dev

# Build and start everything
docker-compose up --build
```

### Daily Development

```bash
# Start the dev environment
docker-compose up

# In another terminal, watch logs
docker-compose logs -f app

# Stop everything
docker-compose down

# Stop and remove persisted data (clean slate)
docker-compose down -v
```

### Accessing Services

| Service | URL | Description |
|---|---|---|
| Site | [http://localhost:8788](http://localhost:8788) | Main application |
| Firebase Emulator UI | [http://localhost:4000](http://localhost:4000) | Auth, Firestore, Storage browser |
| Firestore Emulator | `localhost:8080` | Direct Firestore access |
| Auth Emulator | `localhost:9099` | Direct Auth access |
| Storage Emulator | `localhost:9199` | Direct Storage access |

---

## Local vs Production Configuration

The app detects whether it's running locally and connects to emulators accordingly. This is handled in `firebase-config.js` (see [LLM-FIREBASE.md](LLM-FIREBASE.md)):

```javascript
// Auto-detect local development
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
}
```

### Wrangler Local Geolocation

When running locally, `request.cf` is simulated by Wrangler. You can pass mock geolocation data:

```bash
# In the Dockerfile CMD or docker-compose command
wrangler pages dev ./ --port 8788 --ip 0.0.0.0 --live-reload \
  --var CF_COUNTRY:GB --var CF_CITY:London --var CF_REGION:"England"
```

Or in the Worker code, add a fallback for local development:

```javascript
// functions/api/location.js
const cf = request.cf || {};
const location = {
  country: cf.country || env.CF_COUNTRY || 'GB',
  city: cf.city || env.CF_CITY || 'London',
  region: cf.region || env.CF_REGION || 'England',
  // ...
};
```

---

## Seeding Test Data

For local development, it's useful to seed the Firebase emulators with test data.

### Seed Script: `scripts/seed-emulators.js`

```javascript
const { initializeApp } = require('firebase/app');
const { getFirestore, connectFirestoreEmulator, collection, doc, setDoc } = require('firebase/firestore');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');

const app = initializeApp({ projectId: 'ham-sandwich', apiKey: 'fake-key' });
const db = getFirestore(app);
const auth = getAuth(app);

connectFirestoreEmulator(db, 'localhost', 8080);
connectAuthEmulator(auth, 'http://localhost:9099');

async function seed() {
  console.log('Seeding Firebase emulators...');

  // Create a test user
  const { user } = await createUserWithEmailAndPassword(auth, 'test@example.com', 'password123');
  console.log(`Created test user: ${user.uid}`);

  // Create user profile
  await setDoc(doc(db, 'users', user.uid, 'profile'), {
    email: 'test@example.com',
    display_name: 'TestUser',
    created_at: new Date().toISOString(),
    last_login: new Date().toISOString(),
    total_tests_taken: 0,
    total_csvs_generated: 0,
  });

  // Add sample CSV directory entries
  const sampleCSVs = [
    {
      title: 'VHF Repeaters London',
      description: 'Popular VHF repeaters around London',
      csv_storage_path: 'csvs/sample1.csv',
      metadata: {
        num_channels: 15,
        freq_min: 144.0,
        freq_max: 148.0,
        modes: ['FM'],
        includes_repeaters: true,
        bands: ['VHF'],
        location: 'London, UK',
        llm_provider: 'openai',
        validation_level: 'standard',
      },
      created_at: new Date().toISOString(),
      created_by: user.uid,
      download_count: 5,
      tags: ['vhf', 'repeaters', 'london', 'uk'],
    },
  ];

  for (const csv of sampleCSVs) {
    await setDoc(doc(collection(db, 'csv_directory')), csv);
  }

  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch(console.error);
```

Run it:
```bash
# With Docker running
docker-compose exec app node scripts/seed-emulators.js

# Or locally
node scripts/seed-emulators.js
```

---

## Running Without Docker

If Docker is not available or not preferred, you can run everything directly:

```bash
# Terminal 1: Start Firebase emulators
firebase emulators:start --only auth,firestore,storage

# Terminal 2: Start Wrangler dev server
wrangler pages dev ./ --port 8788 --live-reload
```

This requires:
- Node.js 20+
- Java JRE (for Firebase emulators)
- `npm install -g wrangler firebase-tools`

The Docker approach is preferred because it avoids the Java dependency and ensures a consistent environment across machines.

---

## CI/CD with Docker (Optional)

If you set up CI/CD (e.g., GitHub Actions), Docker can be used for testing:

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start services
        run: docker-compose up -d

      - name: Wait for services
        run: |
          sleep 30
          curl -f http://localhost:8788 || exit 1
          curl -f http://localhost:4000 || exit 1

      - name: Run tests
        run: docker-compose exec -T app npm test

      - name: Stop services
        run: docker-compose down -v
```

> **Note**: This CI/CD pipeline is separate from Cloudflare Pages deployment, which happens automatically on Git push (see [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md)). The Docker-based CI is for running tests before the code hits `main`.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Firebase emulators won't start | Check Java is installed: `java -version`. In Docker, this is handled by the Dockerfile. |
| Port conflicts | Change ports in `docker-compose.yml` and `firebase.json`. Common conflicts: 8080 (other dev servers), 9099. |
| Wrangler can't find `functions/` directory | Ensure the functions directory exists and contains valid Worker scripts. |
| Live reload not working | Check volume mounts in `docker-compose.yml`. The source directory must be mounted into the container. |
| Firebase emulator data lost | Use the named volume (`firebase-data`) in docker-compose. Run `docker-compose down` (not `docker-compose down -v`) to preserve data. |
| Can't connect to Firebase from app container | Use hostname `firebase` (the Docker service name) instead of `localhost` in server-side code. Client-side JS in the browser still uses `localhost` since the browser connects to the exposed ports. |
| Container build fails on ARM Mac (M1/M2/M3) | Ensure Docker Compose uses `platform: linux/amd64` if needed, though most images support ARM natively. |
