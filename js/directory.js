(function () {
  const LOCAL_DIRECTORY_KEY = 'ham_csv_directory_local';

  const list = document.getElementById('directory-list');
  const modeFilter = document.getElementById('mode-filter');
  const bandFilter = document.getElementById('band-filter');
  const repeatersFilter = document.getElementById('repeaters-filter');
  const sortFilter = document.getElementById('sort-filter');
  const searchInput = document.getElementById('directory-search');
  const statusBox = document.getElementById('directory-status');
  let entries = [];

  if (!list) {
    return;
  }

  function setStatus(message) {
    if (statusBox) {
      statusBox.textContent = message;
    }
  }

  function normalizeEntry(id, data) {
    const metadata = data.metadata || {};
    const createdAt = String(data.created_at || data.createdAt || new Date().toISOString());
    const modes = Array.isArray(metadata.modes) ? metadata.modes : [];
    const bands = Array.isArray(metadata.bands) ? metadata.bands : [];
    const tags = Array.isArray(data.tags) ? data.tags : [];

    return {
      id,
      title: String(data.title || 'Untitled CHIRP list'),
      description: String(data.description || ''),
      metadata: {
        num_channels: Number(metadata.num_channels || 0),
        freq_min: Number(metadata.freq_min || 0),
        freq_max: Number(metadata.freq_max || 0),
        modes,
        includes_repeaters: Boolean(metadata.includes_repeaters),
        bands,
        location: String(metadata.location || ''),
        llm_provider: String(metadata.llm_provider || ''),
        validation_level: String(metadata.validation_level || 'standard')
      },
      created_at: createdAt,
      created_by: data.created_by || null,
      csv_storage_path: String(data.csv_storage_path || ''),
      csv_download_url: String(data.csv_download_url || ''),
      csv_content: String(data.csv_content || ''),
      download_count: Number(data.download_count || 0),
      tags
    };
  }

  async function loadFromFirebase() {
    if (!window.HamFirebase || typeof window.HamFirebase.init !== 'function') {
      return [];
    }

    const state = await window.HamFirebase.init();
    if (!state.available || !state.db) {
      return [];
    }

    const snapshot = await state.db.collection('csv_directory').limit(200).get();
    return snapshot.docs.map((doc) => normalizeEntry(doc.id, doc.data()));
  }

  function loadFromLocalStorage() {
    try {
      const raw = window.localStorage.getItem(LOCAL_DIRECTORY_KEY) || '[]';
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((item) => normalizeEntry(item.id || `${Date.now()}-${Math.random()}`, item));
    } catch (_error) {
      return [];
    }
  }

  function toDate(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date(0);
    }
    return parsed;
  }

  function downloadCsv(entry) {
    if (entry.csv_download_url) {
      window.open(entry.csv_download_url, '_blank', 'noopener');
      return;
    }

    if (!entry.csv_content) {
      setStatus('No downloadable file URL available for this item yet.');
      return;
    }

    const blob = new Blob([entry.csv_content], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    link.href = href;
    link.download = `${safeTitle || 'chirp-list'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  }

  async function saveFavourite(entry) {
    const state = window.HamFirebase ? await window.HamFirebase.init() : null;
    const user = state?.auth?.currentUser || null;

    if (!state?.available || !state?.db || !user?.uid) {
      setStatus('Log in with Firebase to save favourites to your account.');
      return;
    }

    await state.db
      .collection('users')
      .doc(user.uid)
      .collection('favourites')
      .doc(entry.id)
      .set({
        csv_id: entry.id,
        title: entry.title,
        favourited_at: new Date().toISOString()
      });

    setStatus(`Added "${entry.title}" to your favourites.`);
  }

  function render() {
    const mode = modeFilter ? modeFilter.value : 'all';
    const band = bandFilter ? bandFilter.value : 'all';
    const repeaters = repeatersFilter ? repeatersFilter.value : 'all';
    const sortBy = sortFilter ? sortFilter.value : 'newest';
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filtered = entries.filter((item) => {
      const modes = item.metadata.modes || [];
      const bands = item.metadata.bands || [];
      const includesRepeaters = Boolean(item.metadata.includes_repeaters);

      const modeMatch = mode === 'all' || modes.includes(mode);
      const bandMatch = band === 'all' || bands.includes(band);
      const repeatersMatch =
        repeaters === 'all' ||
        (repeaters === 'included' && includesRepeaters) ||
        (repeaters === 'excluded' && !includesRepeaters);
      const haystack = [item.title, item.description, item.metadata.location, (item.tags || []).join(' ')].join(' ').toLowerCase();
      const textMatch = !term || haystack.includes(term);
      return modeMatch && bandMatch && repeatersMatch && textMatch;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'downloads') {
        return b.download_count - a.download_count;
      }
      if (sortBy === 'channels') {
        return (b.metadata.num_channels || 0) - (a.metadata.num_channels || 0);
      }
      return toDate(b.created_at).getTime() - toDate(a.created_at).getTime();
    });

    if (filtered.length === 0) {
      list.innerHTML = '<article class="card"><p>No directory entries match current filters.</p></article>';
      return;
    }

    list.innerHTML = filtered
      .map(
        (item) => `
          <article class="card">
            <h3>${window.HamUtils.escapeHtml(item.title)}</h3>
            <p class="small-text">Location: ${window.HamUtils.escapeHtml(item.metadata.location || 'Unknown')}</p>
            <p class="small-text">Modes: ${window.HamUtils.escapeHtml((item.metadata.modes || []).join(', ') || 'N/A')} | Bands: ${window.HamUtils.escapeHtml((item.metadata.bands || []).join(', ') || 'N/A')}</p>
            <p class="small-text">Channels: ${item.metadata.num_channels || 0} | Downloads: ${item.download_count || 0} | Created: ${window.HamUtils.escapeHtml(item.created_at.slice(0, 10))}</p>
            <p class="small-text">Keywords: ${window.HamUtils.escapeHtml((item.tags || []).join(', ') || 'none')}</p>
            <p class="small-text">${window.HamUtils.escapeHtml(item.description || '')}</p>
            <div class="horizontal-flex gap-sm">
              <a class="btn-secondary" href="/chirp-csv/read/?id=${encodeURIComponent(item.id)}">View</a>
              <button class="btn-box btn-sm" type="button" data-download-id="${window.HamUtils.escapeHtml(item.id)}">Download</button>
              <button class="btn-secondary" type="button" data-favourite-id="${window.HamUtils.escapeHtml(item.id)}" data-auth-action="add this to your favourites">★ Favourite</button>
            </div>
          </article>
        `
      )
      .join('');

    list.querySelectorAll('[data-download-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.getAttribute('data-download-id');
        const entry = entries.find((item) => item.id === id);
        if (!entry) {
          return;
        }

        downloadCsv(entry);

        try {
          if (window.HamFirebase && typeof window.HamFirebase.init === 'function') {
            const state = await window.HamFirebase.init();
            if (state.available && state.db) {
              await state.db.collection('csv_directory').doc(entry.id).update({
                download_count: (entry.download_count || 0) + 1
              });
            }
          }
        } catch (_error) {
          return;
        }
      });
    });

    list.querySelectorAll('[data-favourite-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.getAttribute('data-favourite-id');
        const entry = entries.find((item) => item.id === id);
        if (!entry) {
          return;
        }

        try {
          await saveFavourite(entry);
        } catch (_error) {
          setStatus('Unable to save favourite right now.');
        }
      });
    });
  }

  [modeFilter, bandFilter, repeatersFilter, sortFilter, searchInput].forEach((control) => {
    if (control) {
      control.addEventListener('input', render);
    }
  });

  (async function initDirectory() {
    setStatus('Loading CHIRP directory entries…');

    try {
      const firebaseEntries = await loadFromFirebase();
      if (firebaseEntries.length > 0) {
        entries = firebaseEntries;
        setStatus(`Loaded ${entries.length} entries from Firebase directory.`);
      } else {
        entries = loadFromLocalStorage();
        setStatus(
          entries.length > 0
            ? `Loaded ${entries.length} local entries (Firebase unavailable or empty).`
            : 'No directory entries found yet. Generate a CSV to create one.'
        );
      }
    } catch (_error) {
      entries = loadFromLocalStorage();
      setStatus(
        entries.length > 0
          ? `Loaded ${entries.length} local entries (Firebase unavailable).`
          : 'Unable to reach Firebase. Generate a CSV to create local entries.'
      );
    }

    render();
  })();
})();
