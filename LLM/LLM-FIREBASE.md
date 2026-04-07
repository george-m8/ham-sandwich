# Ham Sandwich — Firebase Setup

> Authentication, database, storage, and security configuration for user accounts, saved data, and generated content.

## Related Documents

| Document | Description |
|---|---|
| [LLM-OVERVIEW.md](LLM-OVERVIEW.md) | High-level project overview |
| [LLM-SITE.md](LLM-SITE.md) | Site architecture — account pages and auth UI |
| [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md) | CSV generation — saved keys and CSV storage |
| [LLM-TEST.md](LLM-TEST.md) | Test system — results and progress persistence |
| [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) | Hosting — Workers interact with Firebase |
| [LLM-DOCKER.md](LLM-DOCKER.md) | Local dev — Firebase Emulator Suite |

---

## Firebase Services Used

| Service | Purpose |
|---|---|
| **Firebase Authentication** | User sign-up, login, session management |
| **Cloud Firestore** | User profiles, API keys, test results, CSV directory |
| **Firebase Storage** | Generated CSV file storage |
| **Firebase Hosting** | Not used — hosting is via Cloudflare Pages (see [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md)) |

---

## Human Setup Steps

These are the manual steps a human must complete to set up Firebase for the project.

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Name: `ham-sandwich` (or preferred name)
4. Enable Google Analytics if desired (not required)
5. Click **Create project**

### 2. Register Web App

1. In the Firebase Console, go to **Project Settings > General**
2. Under "Your apps", click the **Web** icon (`</>`)
3. Register app with nickname: `ham-sandwich-web`
4. **Do NOT** enable Firebase Hosting (we use Cloudflare Pages)
5. Copy the Firebase config object — it looks like:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "ham-sandwich.firebaseapp.com",
  projectId: "ham-sandwich",
  storageBucket: "ham-sandwich.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. Save this config — it will go in `/js/firebase-config.js`

### 3. Enable Authentication Providers

1. In Firebase Console, go to **Authentication > Sign-in method**
2. Enable **Email/Password**:
   - Click Email/Password
   - Toggle **Enable** → On
   - Leave "Email link (passwordless sign-in)" disabled for now
   - Save
3. Enable **Google**:
   - Click Google
   - Toggle **Enable** → On
   - Set a project public-facing name (e.g., "Ham Sandwich")
   - Set support email
   - Save
4. Under **Authentication > Settings**:
   - Set **Authorized domains**: Add your Cloudflare Pages domain (e.g., `ham-sandwich.pages.dev`, `yourdomain.com`)

### 4. Create Firestore Database

1. Go to **Firestore Database** in Firebase Console
2. Click **Create database**
3. Choose **Start in production mode** (we'll set up security rules)
4. Select a location close to your users (e.g., `europe-west2` for UK)
5. Click **Enable**

### 5. Set Up Firebase Storage

1. Go to **Storage** in Firebase Console
2. Click **Get started**
3. Choose **Start in production mode**
4. Select same location as Firestore
5. Click **Done**

### 6. Install Firebase CLI (Local Development)

```bash
npm install -g firebase-tools
firebase login
firebase init
```

During `firebase init`:
- Select: **Firestore**, **Storage**, **Emulators**
- Use existing project: `ham-sandwich`
- Accept default file names for rules and indexes
- Emulators: Select **Auth**, **Firestore**, **Storage**
- Accept default ports

### 7. Deploy Security Rules

After setting up rules (see below), deploy them:

```bash
firebase deploy --only firestore:rules,storage
```

---

## Firebase Configuration in Code

All Firebase configuration keys are listed in [example.env](../example.env) for reference. Because the frontend is plain static HTML/JS (no build step), `process.env` is not available in browser code.

Use a small client config module with the Firebase public values:

### `/js/firebase-config-values.js`

```javascript
export const FIREBASE_CONFIG = {
  apiKey: 'AIza...your-key...',
  authDomain: 'ham-sandwich.firebaseapp.com',
  projectId: 'ham-sandwich',
  storageBucket: 'ham-sandwich.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123'
};
```

> **Note**: These are public Firebase Web config values and are safe in client code. Security is enforced by Firebase Auth + Firestore/Storage rules.

### `/js/firebase-config.js`

```javascript
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { FIREBASE_CONFIG } from './firebase-config-values.js';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Connect to emulators in development
// See LLM-DOCKER.md for local development setup
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
}

export { app, auth, db, storage };
```

---

## Firestore Data Model

### Collections Overview

```
firestore/
├── users/
│   └── {uid}/
│       ├── profile             (document — user metadata)
│       ├── api_keys/           (subcollection)
│       │   └── {provider}      (document per provider)
│       ├── test_results/       (subcollection)
│       │   └── {resultId}      (document per test session)
│       ├── question_stats/     (subcollection)
│       │   └── {questionId}    (document per question)
│       ├── saved_csvs/         (subcollection)
│       │   └── {csvId}         (document — link to directory entry)
│       └── favourites/         (subcollection)
│           └── {csvId}         (document — favourited directory entry)
├── csv_directory/
│   └── {csvId}                 (document per public CSV)
└── site_config/
    └── support_links           (document — configurable links)
```

### Collection: `users/{uid}/profile`

```json
{
  "email": "user@example.com",
  "display_name": "M7ABC",
  "created_at": "2026-03-29T10:00:00Z",
  "last_login": "2026-03-29T14:30:00Z",
  "total_tests_taken": 15,
  "total_csvs_generated": 3
}
```

### Collection: `users/{uid}/api_keys/{provider}`

```json
{
  "provider": "openai",
  "encrypted_key": "U2FsdGVkX1+...",
  "key_hint": "sk-...a3f9",
  "added_at": "2026-03-29T10:05:00Z",
  "last_used": "2026-03-29T14:00:00Z"
}
```

#### API Key Encryption

API keys are encrypted **client-side** before being stored in Firestore:

1. A per-user encryption key is derived from the user's UID + a client-side salt using PBKDF2
2. The API key is encrypted with AES-256-GCM using the Web Crypto API
3. Only the encrypted ciphertext is stored in Firestore
4. Decryption happens client-side when the key is needed for an LLM request
5. The encryption key is never sent to the server or stored in Firestore

```javascript
// Simplified encryption flow
async function encryptApiKey(apiKey, userUid) {
  const salt = new TextEncoder().encode(`ham-sandwich-${userUid}`);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(userUid),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const encKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encKey,
    new TextEncoder().encode(apiKey)
  );
  // Store iv + ciphertext as base64
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));
}
```

> **Security note**: This approach means that even if Firestore data is compromised, the API keys cannot be decrypted without knowing the user's UID (which would require compromising Firebase Auth as well). For stronger security, consider using a server-side encryption key stored in Cloudflare Worker secrets — see [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md).

### Collection: `users/{uid}/test_results/{resultId}`

```json
{
  "test_type": "practice",
  "date": "2026-03-29T14:30:00Z",
  "total_questions": 15,
  "correct_count": 12,
  "score_percentage": 80,
  "categories": {
    "safety": { "correct": 3, "total": 3 },
    "propagation": { "correct": 2, "total": 3 }
  },
  "wrong_answers": ["SF-003", "PR-007", "TB-012"],
  "time_taken_seconds": 420,
  "pass": true
}
```

### Collection: `users/{uid}/question_stats/{questionId}`

Used for spaced repetition — see [LLM-TEST.md](LLM-TEST.md).

```json
{
  "question_id": "PR-007",
  "times_wrong": 3,
  "times_correct": 1,
  "last_wrong": "2026-03-29T14:30:00Z",
  "last_correct": "2026-03-28T10:15:00Z",
  "weight": 2.3
}
```

### Collection: `csv_directory/{csvId}`

Public collection for the CSV directory — see [LLM-CHIRP-CSV.md](LLM-CHIRP-CSV.md).

**Every generation is written here automatically**, regardless of whether the user is logged in. `created_by` is `null` for anonymous generations.

```json
{
  "title": "VHF repeaters around London",
  "description": "Interesting VHF FM repeaters within 50 miles of London",
  "csv_storage_path": "csvs/abc123.csv",
  "metadata": {
    "num_channels": 25,
    "freq_min": 144.0,
    "freq_max": 148.0,
    "modes": ["FM"],
    "includes_repeaters": true,
    "bands": ["VHF"],
    "location": "London, UK",
    "llm_provider": "openai",
    "validation_level": "standard"
  },
  "created_at": "2026-03-29T12:00:00Z",
  "created_by": "user_uid",  // null for anonymous generations
  "download_count": 0,
  "tags": ["vhf", "repeaters", "london", "uk", "fm"]
}
```

### Collection: `users/{uid}/saved_csvs/{csvId}`

Written when a logged-in user generates a CSV. Links the user to their `csv_directory` entry. Deleting this record also clears `created_by` on the directory entry (it remains in the directory, just anonymised).

```json
{
  "csv_id": "abc123",
  "title": "VHF repeaters around London",
  "generated_at": "2026-03-29T12:00:00Z"
}
```

### Collection: `users/{uid}/favourites/{csvId}`

Stored when a logged-in user favourites any directory entry. Private to the user — never exposed publicly, never shown on the directory entry itself.

```json
{
  "csv_id": "abc123",
  "title": "VHF repeaters around London",
  "favourited_at": "2026-03-29T15:00:00Z"
}
```

---

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ─── User Profiles ───
    match /users/{userId}/profile {
      // Users can only read/write their own profile
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // ─── API Keys ───
    match /users/{userId}/api_keys/{provider} {
      // Users can only access their own API keys
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // ─── Test Results ───
    match /users/{userId}/test_results/{resultId} {
      // Users can only access their own test results
      allow read, write: if request.auth != null && request.auth.uid == userId;
      // Validate required fields on create
      allow create: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.data.keys().hasAll(['test_type', 'date', 'total_questions', 'correct_count']);
    }

    // ─── Question Stats (Spaced Repetition) ───
    match /users/{userId}/question_stats/{questionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // ─── CSV Directory ───
    match /csv_directory/{csvId} {
      // Anyone can read the public directory
      allow read: if true;
      // Anyone (including anonymous) can create entries — all generations are auto-saved
      // created_by must either be null (anonymous) or match the authenticated user
      allow create: if (request.resource.data.created_by == null
                       || (request.auth != null && request.resource.data.created_by == request.auth.uid))
                    && request.resource.data.keys().hasAll(['title', 'csv_storage_path', 'metadata', 'created_at', 'created_by']);
      // Only the creator can update/delete their own named entries
      // Clearing created_by (anonymising) is also allowed by the creator
      allow update: if request.auth != null
                    && resource.data.created_by == request.auth.uid;
      allow delete: if request.auth != null
                    && resource.data.created_by == request.auth.uid;
    }

    // ─── User: Saved CSVs ───
    match /users/{userId}/saved_csvs/{csvId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // ─── User: Favourites ───
    match /users/{userId}/favourites/{csvId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // ─── Site Config ───
    match /site_config/{document} {
      // Public read for site configuration
      allow read: if true;
      // No client-side writes — managed via Firebase Console or admin SDK
      allow write: if false;
    }

    // ─── Default deny ───
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## Firebase Storage Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // ─── Generated CSVs ───
    match /csvs/{csvFile} {
      // Anyone can download CSVs from the directory
      allow read: if true;
      // Anyone (including anonymous) can upload a generated CSV
      // Size and content-type validated; auth is optional
      allow write: if request.resource.size < 1 * 1024 * 1024  // Max 1MB
                   && request.resource.contentType == 'text/csv';
    }

    // ─── Default deny ───
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

---

## Authentication Flow

### Sign Up (Email/Password)

```
User fills sign-up form → createUserWithEmailAndPassword()
    → Firebase creates auth account
    → onAuthStateChanged() fires
    → auth.js creates profile document in /users/{uid}/profile
    → UI updates (nav shows username, account pages accessible)
```

### Sign In (Email/Password)

```
User fills login form → signInWithEmailAndPassword()
    → Firebase verifies credentials
    → onAuthStateChanged() fires
    → auth.js loads user profile from Firestore
    → UI updates
```

### Sign In (Google)

```
User clicks "Sign in with Google" → signInWithPopup(GoogleAuthProvider)
    → Firebase handles OAuth flow
    → onAuthStateChanged() fires
    → auth.js checks if profile exists, creates if new user
    → UI updates
```

### Sign Out

```
User clicks "Logout" → signOut()
    → onAuthStateChanged() fires with null user
    → auth.js clears user data from memory
    → UI updates (nav shows "Login", account pages redirect)
```

### Auth State Listener (`auth.js`)

```javascript
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase-config.js';

window.currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.currentUser = user;

    // Load or create profile
    const profileRef = doc(db, 'users', user.uid, 'profile');
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        email: user.email,
        display_name: user.displayName || user.email.split('@')[0],
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        total_tests_taken: 0,
        total_csvs_generated: 0
      });
    } else {
      await setDoc(profileRef, { last_login: new Date().toISOString() }, { merge: true });
    }

    // Update nav
    document.getElementById('account-link').textContent = user.displayName || 'Account';
  } else {
    window.currentUser = null;
    document.getElementById('account-link').textContent = 'Login';
  }
});
```

---

## Firestore Indexes

Some queries require composite indexes. Create these in `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "csv_directory",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "metadata.modes", "arrayConfig": "CONTAINS" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "csv_directory",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "metadata.bands", "arrayConfig": "CONTAINS" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "csv_directory",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "metadata.includes_repeaters", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "test_results",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "test_type", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "question_stats",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "weight", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

---

## Cost Considerations

Firebase pricing (Blaze / pay-as-you-go plan required for production):

| Service | Free Tier | Notes |
|---|---|---|
| Authentication | 10K verifications/month | More than sufficient |
| Firestore Reads | 50K/day | Monitor CSV directory reads |
| Firestore Writes | 20K/day | Monitor test result saves |
| Firestore Storage | 1 GB | Question stats grow per user |
| Firebase Storage | 5 GB, 1 GB/day download | CSV files are small (~5-50KB each) |

For a hobby project, usage will comfortably stay within the free tier. If the CSV directory grows large, consider:
- Pagination on directory queries (already planned)
- Caching directory listings via Cloudflare — see [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md)
- Setting up billing alerts in Google Cloud Console
