(function () {
  function readLocalUser() {
    try {
      const userRaw = window.localStorage.getItem('ham_user');
      return userRaw ? JSON.parse(userRaw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeLocalUser(user) {
    window.localStorage.setItem('ham_user', JSON.stringify(user));
  }

  function updateAccountLink(user) {
    const accountLink = document.getElementById('account-link');
    if (!accountLink) {
      return;
    }

    if (user && user.name) {
      accountLink.textContent = user.name;
    } else {
      accountLink.textContent = 'Login';
    }
  }

  function ensureLoginModal() {
    let overlay = document.getElementById('login-overlay');
    if (overlay) {
      return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <h3 id="login-title">Login</h3>
        <p class="small-text">Sign in with Firebase when available. Local fallback is enabled for development.</p>
        <div id="login-status" class="login-status">Checking authentication setup…</div>
        <form id="login-modal-form">
          <div class="form-group">
            <label for="login-email">Email</label>
            <input type="email" id="login-email" required placeholder="you@example.com">
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" required placeholder="••••••••">
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" id="login-cancel">Cancel</button>
            <button type="submit" class="btn-box btn-sm">Login</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function setStatus(message, warn) {
    const status = document.getElementById('login-status');
    if (!status) {
      return;
    }
    status.textContent = message;
    status.classList.toggle('warn', Boolean(warn));
  }

  async function resolveFirebase() {
    if (!window.HamFirebase || typeof window.HamFirebase.init !== 'function') {
      return { available: false, reason: 'firebase-bootstrap-missing' };
    }

    const result = await window.HamFirebase.init();
    return {
      available: Boolean(result.available),
      auth: result.auth,
      reason: result.reason || 'unknown'
    };
  }

  function openLoginModal() {
    const overlay = ensureLoginModal();
    overlay.classList.add('open');
  }

  function closeLoginModal() {
    const overlay = document.getElementById('login-overlay');
    if (!overlay) {
      return;
    }
    overlay.classList.remove('open');
  }

  async function setupModalBehavior() {
    const overlay = ensureLoginModal();
    const cancelButton = document.getElementById('login-cancel');
    const form = document.getElementById('login-modal-form');

    if (!form || !cancelButton) {
      return;
    }

    cancelButton.addEventListener('click', closeLoginModal);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeLoginModal();
      }
    });

    const firebaseState = await resolveFirebase();
    if (firebaseState.available) {
      setStatus('Firebase Auth is available.', false);
    } else {
      setStatus('Firebase not available. Using local development fallback.', true);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const emailInput = document.getElementById('login-email');
      const passwordInput = document.getElementById('login-password');
      if (!emailInput || !passwordInput) {
        return;
      }

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      const state = await resolveFirebase();

      if (state.available && state.auth) {
        try {
          const credential = await state.auth.signInWithEmailAndPassword(email, password);
          const firebaseUser = credential.user;
          const user = {
            name: firebaseUser?.displayName || email.split('@')[0],
            email: firebaseUser?.email || email,
            source: 'firebase'
          };

          writeLocalUser(user);
          window.currentUser = user;
          updateAccountLink(user);
          setStatus('Signed in with Firebase.', false);
          closeLoginModal();
          return;
        } catch (error) {
          setStatus('Firebase login failed. Falling back to local login mode.', true);
        }
      }

      const fallbackUser = {
        name: email.split('@')[0] || 'Operator',
        email,
        source: 'local-fallback'
      };

      writeLocalUser(fallbackUser);
      window.currentUser = fallbackUser;
      updateAccountLink(fallbackUser);
      closeLoginModal();
    });
  }

  window.currentUser = readLocalUser();
  updateAccountLink(window.currentUser);
  setupModalBehavior();

  const accountLink = document.getElementById('account-link');
  if (accountLink) {
    accountLink.addEventListener('click', (event) => {
      if (window.currentUser) {
        return;
      }
      event.preventDefault();
      openLoginModal();
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-auth-action]');
    if (!target || window.currentUser) {
      return;
    }

    event.preventDefault();
    const action = target.getAttribute('data-auth-action') || 'continue';
    setStatus(`Please log in to ${action}.`, true);
    openLoginModal();
  });
})();
