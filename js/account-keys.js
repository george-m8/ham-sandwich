(function () {
  const providerInput = document.getElementById('keys-provider');
  const apiKeyInput = document.getElementById('keys-api-key');
  const saveButton = document.getElementById('keys-save-account-btn');
  const loadButton = document.getElementById('keys-load-account-btn');
  const deleteButton = document.getElementById('keys-delete-account-btn');
  const statusBox = document.getElementById('keys-status');
  const listBox = document.getElementById('keys-list');

  if (!providerInput || !apiKeyInput || !saveButton || !loadButton || !deleteButton) {
    return;
  }

  function setStatus(message) {
    if (statusBox) statusBox.textContent = message;
  }

  async function refreshList() {
    if (!window.HamKeyStore || !listBox) {
      return;
    }

    try {
      const keys = await window.HamKeyStore.listUserKeys();
      if (!keys.length) {
        listBox.innerHTML = '<p>No account keys saved yet.</p>';
        return;
      }

      listBox.innerHTML = `
        <h3>Saved Providers</h3>
        <ul class="list-reset">
          ${keys
            .map(
              (item) => `<li class="small-text">• ${window.HamUtils.escapeHtml(item.provider)} (${window.HamUtils.escapeHtml(item.key_hint || 'no hint')})</li>`
            )
            .join('')}
        </ul>
      `;
    } catch (_error) {
      listBox.innerHTML = '<p>Unable to load saved key list.</p>';
    }
  }

  async function saveKey() {
    const provider = providerInput.value;
    const apiKey = String(apiKeyInput.value || '').trim();
    if (!apiKey) {
      setStatus('Enter an API key first.');
      return;
    }

    try {
      await window.HamKeyStore.saveUserKey(provider, apiKey);
      await window.HamKeyStore.saveSessionKey(provider, apiKey);
      setStatus('Saved API key to account and session.');
      await refreshList();
    } catch (error) {
      setStatus(error?.message || 'Unable to save account key.');
    }
  }

  async function loadKey() {
    const provider = providerInput.value;

    try {
      const key = await window.HamKeyStore.getUserKey(provider);
      if (!key) {
        setStatus('No key found for selected provider.');
        return;
      }

      apiKeyInput.value = key;
      await window.HamKeyStore.saveSessionKey(provider, key);
      setStatus('Loaded key from account and copied to session storage.');
    } catch (error) {
      setStatus(error?.message || 'Unable to load account key.');
    }
  }

  async function deleteKey() {
    const provider = providerInput.value;
    try {
      await window.HamKeyStore.deleteUserKey(provider);
      setStatus('Deleted saved key for selected provider.');
      await refreshList();
    } catch (error) {
      setStatus(error?.message || 'Unable to delete key.');
    }
  }

  saveButton.addEventListener('click', () => {
    void saveKey();
  });
  loadButton.addEventListener('click', () => {
    void loadKey();
  });
  deleteButton.addEventListener('click', () => {
    void deleteKey();
  });

  (async function init() {
    setStatus('Ready. Login is required to save provider keys to your account.');
    await refreshList();
  })();
})();
