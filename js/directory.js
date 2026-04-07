(function () {
  const LOCAL_DIRECTORY_KEY = 'ham_csv_directory_local';
  const LOCAL_FREQUENCY_KEY = 'ham_frequency_directory_local';

  const list = document.getElementById('directory-list');
  const entityFilter = document.getElementById('entity-filter');
  const modeFilter = document.getElementById('mode-filter');
  const bandFilter = document.getElementById('band-filter');
  const repeatersFilter = document.getElementById('repeaters-filter');
  const regionFilter = document.getElementById('region-filter');
  const frequencyFilter = document.getElementById('frequency-filter');
  const serviceTagFilter = document.getElementById('service-tag-filter');
  const sortFilter = document.getElementById('sort-filter');
  const searchInput = document.getElementById('directory-search');
  const statusBox = document.getElementById('directory-status');
  let listEntries = [];
  let frequencyEntries = [];

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

  function normalizeFrequencyEntry(id, data) {
    const location = data.location_context || {};
    return {
      id,
      list_id: String(data.list_id || ''),
      name: String(data.name || 'Unnamed'),
      frequency: Number(data.frequency || 0),
      mode: String(data.mode || 'FM'),
      duplex: String(data.duplex || ''),
      comment: String(data.comment || ''),
      service_tags: Array.isArray(data.service_tags) ? data.service_tags : [],
      location_context: {
        country: String(location.country || ''),
        region: String(location.region || ''),
        city: String(location.city || ''),
        free_text: String(location.free_text || '')
      },
      created_at: String(data.created_at || new Date().toISOString()),
      created_by: data.created_by || null
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

  async function loadFrequenciesFromFirebase() {
    if (!window.HamFirebase || typeof window.HamFirebase.init !== 'function') {
      return [];
    }

    const state = await window.HamFirebase.init();
    if (!state.available || !state.db) {
      return [];
    }

    const snapshot = await state.db.collection('frequency_directory').limit(2000).get();
    return snapshot.docs.map((doc) => normalizeFrequencyEntry(doc.id, doc.data()));
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

  function loadFrequenciesFromLocalStorage() {
    try {
      const raw = window.localStorage.getItem(LOCAL_FREQUENCY_KEY) || '[]';
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => normalizeFrequencyEntry(item.id || `${Date.now()}-${Math.random()}`, item));
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

  async function saveFavourite(entry, entityType) {
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
      .doc(`${entityType}-${entry.id}`)
      .set({
        item_id: entry.id,
        item_type: entityType,
        title: entry.title,
        favourited_at: new Date().toISOString()
      });

    setStatus(`Added "${entry.title}" to your favourites.`);
  }

  function renderListDirectory() {
    const mode = modeFilter ? modeFilter.value : 'all';
    const band = bandFilter ? bandFilter.value : 'all';
    const repeaters = repeatersFilter ? repeatersFilter.value : 'all';
    const region = regionFilter ? regionFilter.value.toLowerCase().trim() : '';
    const sortBy = sortFilter ? sortFilter.value : 'newest';
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filtered = listEntries.filter((item) => {
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
      const regionMatch = !region || String(item.metadata.location || '').toLowerCase().includes(region);
      return modeMatch && bandMatch && repeatersMatch && textMatch && regionMatch;
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
        const entry = listEntries.find((item) => item.id === id);
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
        const entry = listEntries.find((item) => item.id === id);
        if (!entry) {
          return;
        }

        try {
          await saveFavourite(entry, 'list');
        } catch (_error) {
          setStatus('Unable to save favourite right now.');
        }
      });
    });
  }

  function renderFrequencyDirectory() {
    const mode = modeFilter ? modeFilter.value : 'all';
    const region = regionFilter ? regionFilter.value.toLowerCase().trim() : '';
    const serviceTag = serviceTagFilter ? serviceTagFilter.value.toLowerCase().trim() : '';
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const sortBy = sortFilter ? sortFilter.value : 'newest';
    const freqText = String(frequencyFilter?.value || '').trim();
    const freqTarget = freqText ? Number(freqText) : null;

    const filtered = frequencyEntries.filter((item) => {
      const modeMatch = mode === 'all' || String(item.mode || '').toUpperCase() === mode;
      const regionHaystack = [item.location_context.country, item.location_context.region, item.location_context.city, item.location_context.free_text].join(' ').toLowerCase();
      const regionMatch = !region || regionHaystack.includes(region);
      const serviceMatch = !serviceTag || (item.service_tags || []).join(' ').toLowerCase().includes(serviceTag);
      const textMatch = !term || [item.name, item.comment, (item.service_tags || []).join(' '), regionHaystack].join(' ').toLowerCase().includes(term);
      const freqMatch = freqTarget === null || !Number.isFinite(freqTarget) || Math.abs(Number(item.frequency) - freqTarget) < 0.0001;
      return modeMatch && regionMatch && serviceMatch && textMatch && freqMatch;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'frequency') {
        return Number(a.frequency) - Number(b.frequency);
      }
      return toDate(b.created_at).getTime() - toDate(a.created_at).getTime();
    });

    if (filtered.length === 0) {
      list.innerHTML = '<article class="card"><p>No frequency entries match current filters.</p></article>';
      return;
    }

    list.innerHTML = filtered
      .slice(0, 250)
      .map((item) => `
          <article class="card">
            <h3>${window.HamUtils.escapeHtml(item.name)} — ${Number(item.frequency || 0).toFixed(4)} MHz</h3>
            <p class="small-text">Mode: ${window.HamUtils.escapeHtml(item.mode || 'N/A')} | Duplex: ${window.HamUtils.escapeHtml(item.duplex || '')}</p>
            <p class="small-text">Location: ${window.HamUtils.escapeHtml([item.location_context.city, item.location_context.region, item.location_context.country, item.location_context.free_text].filter(Boolean).join(', ') || 'Unknown')}</p>
            <p class="small-text">Tags: ${window.HamUtils.escapeHtml((item.service_tags || []).join(', ') || 'none')}</p>
            <p class="small-text">${window.HamUtils.escapeHtml(item.comment || '')}</p>
            <div class="horizontal-flex gap-sm">
              <a class="btn-secondary" href="/chirp-csv/read/?id=${encodeURIComponent(item.list_id)}">Open Parent List</a>
              <button class="btn-secondary" type="button" data-favourite-frequency-id="${window.HamUtils.escapeHtml(item.id)}" data-auth-action="add this to your favourites">★ Favourite</button>
            </div>
          </article>
        `)
      .join('');

    list.querySelectorAll('[data-favourite-frequency-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.getAttribute('data-favourite-frequency-id');
        const entry = frequencyEntries.find((item) => item.id === id);
        if (!entry) return;

        try {
          await saveFavourite({ id: entry.id, title: `${entry.name} ${entry.frequency}` }, 'frequency');
        } catch (_error) {
          setStatus('Unable to save favourite right now.');
        }
      });
    });
  }

  function render() {
    const entity = String(entityFilter?.value || 'lists');
    if (entity === 'frequencies') {
      renderFrequencyDirectory();
      return;
    }
    renderListDirectory();
  }

  [entityFilter, modeFilter, bandFilter, repeatersFilter, regionFilter, frequencyFilter, serviceTagFilter, sortFilter, searchInput].forEach((control) => {
    if (control) {
      control.addEventListener('input', render);
    }
  });

  (async function initDirectory() {
    setStatus('Loading CHIRP directory entries…');

    try {
      const firebaseEntries = await loadFromFirebase();
      const firebaseFrequencies = await loadFrequenciesFromFirebase();
      if (firebaseEntries.length > 0 || firebaseFrequencies.length > 0) {
        listEntries = firebaseEntries;
        frequencyEntries = firebaseFrequencies;
        setStatus(`Loaded ${listEntries.length} lists and ${frequencyEntries.length} frequencies from Firebase directory.`);
      } else {
        listEntries = loadFromLocalStorage();
        frequencyEntries = loadFrequenciesFromLocalStorage();
        setStatus(
          listEntries.length > 0 || frequencyEntries.length > 0
            ? `Loaded ${listEntries.length} local lists and ${frequencyEntries.length} local frequencies.`
            : 'No directory entries found yet. Generate a CSV to create one.'
        );
      }
    } catch (_error) {
      listEntries = loadFromLocalStorage();
      frequencyEntries = loadFrequenciesFromLocalStorage();
      setStatus(
        listEntries.length > 0 || frequencyEntries.length > 0
          ? `Loaded ${listEntries.length} local lists and ${frequencyEntries.length} local frequencies.`
          : 'Unable to reach Firebase. Generate a CSV to create local entries.'
      );
    }

    render();
  })();
})();
