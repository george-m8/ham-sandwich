(function () {
  const SESSION_KEY = 'ham_session_api_keys_v1';
  const SESSION_CRYPTO_SECRET = 'ham_session_crypto_secret_v1';

  function toBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }

  function fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function randomBase64(length = 32) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return toBase64(bytes);
  }

  function getOrCreateSessionSecret() {
    let secret = window.sessionStorage.getItem(SESSION_CRYPTO_SECRET);
    if (!secret) {
      secret = randomBase64(32);
      window.sessionStorage.setItem(SESSION_CRYPTO_SECRET, secret);
    }
    return secret;
  }

  async function deriveAesKey(secret, saltText) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode(saltText),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptText(plainText, secret, saltText) {
    const key = await deriveAesKey(secret, saltText);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(String(plainText || ''))
    );

    return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
  }

  async function decryptText(cipherText, secret, saltText) {
    const [ivBase64, dataBase64] = String(cipherText || '').split('.');
    if (!ivBase64 || !dataBase64) {
      throw new Error('Invalid encrypted payload');
    }

    const key = await deriveAesKey(secret, saltText);
    const iv = fromBase64(ivBase64);
    const encrypted = fromBase64(dataBase64);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  }

  function readSessionMap() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY) || '{}';
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }
      return parsed;
    } catch (_error) {
      return {};
    }
  }

  function writeSessionMap(map) {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(map));
  }

  async function getFirebaseState() {
    if (!window.HamFirebase || typeof window.HamFirebase.init !== 'function') {
      return { available: false };
    }

    const state = await window.HamFirebase.init();
    if (!state.available || !state.db || !state.auth) {
      return { available: false };
    }

    return {
      available: true,
      db: state.db,
      auth: state.auth
    };
  }

  async function saveSessionKey(provider, apiKey) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!normalizedProvider || !apiKey) {
      return false;
    }

    const secret = getOrCreateSessionSecret();
    const encrypted = await encryptText(apiKey, secret, `session:${normalizedProvider}`);
    const map = readSessionMap();
    map[normalizedProvider] = {
      encrypted,
      updated_at: new Date().toISOString()
    };
    writeSessionMap(map);
    return true;
  }

  async function getSessionKey(provider) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!normalizedProvider) {
      return '';
    }

    const map = readSessionMap();
    const item = map[normalizedProvider];
    if (!item || !item.encrypted) {
      return '';
    }

    try {
      const secret = getOrCreateSessionSecret();
      return await decryptText(item.encrypted, secret, `session:${normalizedProvider}`);
    } catch (_error) {
      return '';
    }
  }

  async function saveUserKey(provider, apiKey) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!normalizedProvider || !apiKey) {
      throw new Error('Provider and key are required.');
    }

    const state = await getFirebaseState();
    const user = state.available ? state.auth.currentUser : null;
    if (!state.available || !user?.uid) {
      throw new Error('You must be logged in to save account keys.');
    }

    const encrypted = await encryptText(apiKey, user.uid, `user:${user.uid}:${normalizedProvider}`);
    await state.db
      .collection('users')
      .doc(user.uid)
      .collection('api_keys')
      .doc(normalizedProvider)
      .set({
        provider: normalizedProvider,
        encrypted_key: encrypted,
        key_hint: `${String(apiKey).slice(0, 4)}...${String(apiKey).slice(-4)}`,
        updated_at: new Date().toISOString()
      });

    return true;
  }

  async function getUserKey(provider) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!normalizedProvider) {
      return '';
    }

    const state = await getFirebaseState();
    const user = state.available ? state.auth.currentUser : null;
    if (!state.available || !user?.uid) {
      return '';
    }

    const doc = await state.db
      .collection('users')
      .doc(user.uid)
      .collection('api_keys')
      .doc(normalizedProvider)
      .get();

    if (!doc.exists) {
      return '';
    }

    const data = doc.data() || {};
    if (!data.encrypted_key) {
      return '';
    }

    try {
      return await decryptText(data.encrypted_key, user.uid, `user:${user.uid}:${normalizedProvider}`);
    } catch (_error) {
      return '';
    }
  }

  async function listUserKeys() {
    const state = await getFirebaseState();
    const user = state.available ? state.auth.currentUser : null;
    if (!state.available || !user?.uid) {
      return [];
    }

    const snapshot = await state.db
      .collection('users')
      .doc(user.uid)
      .collection('api_keys')
      .get();

    return snapshot.docs.map((doc) => ({
      provider: doc.id,
      ...(doc.data() || {})
    }));
  }

  async function deleteUserKey(provider) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!normalizedProvider) {
      return false;
    }

    const state = await getFirebaseState();
    const user = state.available ? state.auth.currentUser : null;
    if (!state.available || !user?.uid) {
      throw new Error('You must be logged in to delete account keys.');
    }

    await state.db
      .collection('users')
      .doc(user.uid)
      .collection('api_keys')
      .doc(normalizedProvider)
      .delete();

    return true;
  }

  window.HamKeyStore = {
    saveSessionKey,
    getSessionKey,
    saveUserKey,
    getUserKey,
    listUserKeys,
    deleteUserKey
  };
})();
