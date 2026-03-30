(function () {
  const FIREBASE_APP_SRC = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js';
  const FIREBASE_AUTH_SRC = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js';
  const FIREBASE_FIRESTORE_SRC = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js';
  const FIREBASE_STORAGE_SRC = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage-compat.js';

  async function loadScript(src) {
    if (document.querySelector(`script[data-firebase-src="${src}"]`)) {
      return;
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.firebaseSrc = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function loadConfigFromFile() {
    try {
      const response = await fetch('/data/firebase.json', { cache: 'no-store' });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  window.HamFirebase = {
    initialized: false,
    available: false,
    auth: null,
    db: null,
    storage: null,
    reason: 'not-initialized',

    async init() {
      if (this.initialized) {
        return this;
      }

      this.initialized = true;

      try {
        const config =
          window.HAM_FIREBASE_CONFIG ||
          (await loadConfigFromFile()) ||
          null;

        if (!config || !config.apiKey) {
          this.reason = 'missing-config';
          return this;
        }

        await loadScript(FIREBASE_APP_SRC);
        await loadScript(FIREBASE_AUTH_SRC);
        await loadScript(FIREBASE_FIRESTORE_SRC);
        await loadScript(FIREBASE_STORAGE_SRC);

        if (!window.firebase) {
          this.reason = 'sdk-not-available';
          return this;
        }

        if (!window.firebase.apps || window.firebase.apps.length === 0) {
          window.firebase.initializeApp(config);
        }

        this.auth = window.firebase.auth();
        this.db = window.firebase.firestore();
        this.storage = window.firebase.storage();

        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          try {
            this.auth.useEmulator('http://localhost:9099');
          } catch (_error) {
            // no-op
          }

          try {
            this.db.useEmulator('localhost', 8080);
          } catch (_error) {
            // no-op
          }

          try {
            this.storage.useEmulator('localhost', 9199);
          } catch (_error) {
            // no-op
          }
        }

        this.available = true;
        this.reason = 'ready';
      } catch (error) {
        this.reason = 'init-failed';
      }

      return this;
    }
  };
})();
