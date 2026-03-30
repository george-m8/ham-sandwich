(function () {
  const LOCAL_DIRECTORY_KEY = 'ham_csv_directory_local';
  const titleEl = document.getElementById('view-title');
  const statusEl = document.getElementById('view-status');
  const metaEl = document.getElementById('view-meta');
  const previewEl = document.getElementById('view-preview');
  const downloadButton = document.getElementById('view-download-btn');

  let currentEntry = null;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function getEntryId() {
    const url = new URL(window.location.href);
    return url.searchParams.get('id') || '';
  }

  function normalizeEntry(id, data) {
    return {
      id,
      title: String(data.title || 'Untitled CHIRP list'),
      description: String(data.description || ''),
      created_at: String(data.created_at || new Date().toISOString()),
      metadata: data.metadata || {},
      tags: Array.isArray(data.tags) ? data.tags : [],
      preview_channels: Array.isArray(data.preview_channels) ? data.preview_channels : [],
      csv_content: String(data.csv_content || ''),
      csv_download_url: String(data.csv_download_url || ''),
      download_count: Number(data.download_count || 0)
    };
  }

  function fromLocal(id) {
    try {
      const raw = window.localStorage.getItem(LOCAL_DIRECTORY_KEY) || '[]';
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries)) return null;
      const match = entries.find((item) => item.id === id);
      return match ? normalizeEntry(id, match) : null;
    } catch (_error) {
      return null;
    }
  }

  async function fromFirebase(id) {
    if (!window.HamFirebase || typeof window.HamFirebase.init !== 'function') return null;
    const state = await window.HamFirebase.init();
    if (!state.available || !state.db) return null;

    const doc = await state.db.collection('csv_directory').doc(id).get();
    if (!doc.exists) return null;
    return normalizeEntry(doc.id, doc.data());
  }

  function renderEntry(entry) {
    titleEl.textContent = entry.title;

    const metadata = entry.metadata || {};
    metaEl.innerHTML = [
      `<p><strong>Description:</strong> ${window.HamUtils.escapeHtml(entry.description || 'No description')}</p>`,
      `<p><strong>Location:</strong> ${window.HamUtils.escapeHtml(metadata.location || 'Unknown')}</p>`,
      `<p><strong>Modes:</strong> ${window.HamUtils.escapeHtml((metadata.modes || []).join(', ') || 'N/A')}</p>`,
      `<p><strong>Bands:</strong> ${window.HamUtils.escapeHtml((metadata.bands || []).join(', ') || 'N/A')}</p>`,
      `<p><strong>Keywords:</strong> ${window.HamUtils.escapeHtml((entry.tags || []).join(', ') || 'none')}</p>`,
      `<p><strong>Created:</strong> ${window.HamUtils.escapeHtml(entry.created_at)}</p>`
    ].join('');

    const rows = (entry.preview_channels || []).map((channel) => `
      <tr>
        <td>${window.HamUtils.escapeHtml(channel.name || '')}</td>
        <td>${window.HamUtils.escapeHtml(String(channel.frequency || ''))}</td>
        <td>${window.HamUtils.escapeHtml(channel.mode || '')}</td>
        <td>${window.HamUtils.escapeHtml(channel.duplex || '')}</td>
        <td>${window.HamUtils.escapeHtml(channel.comment || '')}</td>
      </tr>
    `).join('');

    previewEl.innerHTML = rows
      ? `
        <h3>Preview Channels</h3>
        <table class="spec-table">
          <thead>
            <tr><th>Name</th><th>Frequency</th><th>Mode</th><th>Duplex</th><th>Comment</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `
      : '<p>No preview channels are available for this entry.</p>';
  }

  function downloadCurrent() {
    if (!currentEntry) return;

    if (currentEntry.csv_download_url) {
      window.open(currentEntry.csv_download_url, '_blank', 'noopener');
      return;
    }

    if (!currentEntry.csv_content) {
      setStatus('No CSV file URL/content available for this entry.');
      return;
    }

    const blob = new Blob([currentEntry.csv_content], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${currentEntry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'chirp-list'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  }

  downloadButton?.addEventListener('click', downloadCurrent);

  (async function init() {
    const id = getEntryId();
    if (!id) {
      setStatus('Missing list id in URL.');
      return;
    }

    setStatus('Loading CHIRP list…');

    try {
      currentEntry = (await fromFirebase(id)) || fromLocal(id);
    } catch (_error) {
      currentEntry = fromLocal(id);
    }

    if (!currentEntry) {
      setStatus('List not found.');
      return;
    }

    renderEntry(currentEntry);
    setStatus('Loaded list preview.');
  })();
})();
