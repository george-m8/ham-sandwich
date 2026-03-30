(async function () {
  const listContainer = document.getElementById('radios-list');
  const detailContainer = document.getElementById('radios-detail');
  const topTagsContainer = document.getElementById('radio-top-tags');
  const searchInput = document.getElementById('radio-search');
  const bandOptionsContainer = document.getElementById('radio-band-options');
  const currencySelect = document.getElementById('radio-currency');
  const minSelect = document.getElementById('radio-price-min-select');
  const maxSelect = document.getElementById('radio-price-max-select');
  const minLabel = document.getElementById('radio-price-min-label');
  const maxLabel = document.getElementById('radio-price-max-label');
  const activeFiltersContainer = document.getElementById('radio-active-filters');
  const resetButton = document.getElementById('radio-reset-filters');

  if (
    !listContainer ||
    !detailContainer ||
    !topTagsContainer ||
    !searchInput ||
    !bandOptionsContainer ||
    !currencySelect ||
    !minSelect ||
    !maxSelect ||
    !activeFiltersContainer ||
    !resetButton
  ) {
    return;
  }

  const defaultCurrencies = ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'JPY'];
  const fallbackRates = {
    GBP: 1,
    EUR: 1.17,
    USD: 1.27,
    CAD: 1.72,
    AUD: 1.95,
    JPY: 191.0
  };
  const defaultStepMultipliers = {
    GBP: 1,
    EUR: 1,
    USD: 1,
    CAD: 1,
    AUD: 1,
    JPY: 10
  };
  const countryToCurrency = {
    GB: 'GBP',
    IE: 'EUR',
    FR: 'EUR',
    DE: 'EUR',
    NL: 'EUR',
    ES: 'EUR',
    IT: 'EUR',
    PT: 'EUR',
    US: 'USD',
    CA: 'CAD',
    AU: 'AUD',
    JP: 'JPY'
  };

  const state = {
    q: '',
    tags: new Set(),
    bands: new Set(),
    minGbp: 0,
    maxGbp: 0,
    allMinGbp: 0,
    allMaxGbp: 0,
    currency: 'GBP',
    currencies: [...defaultCurrencies],
    rates: { ...fallbackRates },
    stepMultipliers: { ...defaultStepMultipliers },
    stepMultiplier: 1
  };

  function parsePriceRange(priceRange) {
    const matches = String(priceRange || '').match(/\d+/g) || [];
    if (matches.length === 0) {
      return { min: 0, max: 0 };
    }
    const values = matches.map((value) => Number(value));
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  function normalizeRadio(radio) {
    const parsed = parsePriceRange(radio.price_range);
    const min = Number.isFinite(Number(radio.price_min_gbp))
      ? Number(radio.price_min_gbp)
      : parsed.min;
    const max = Number.isFinite(Number(radio.price_max_gbp))
      ? Number(radio.price_max_gbp)
      : parsed.max;

    return {
      ...radio,
      tags: (radio.tags || []).map((tag) => String(tag).toLowerCase()),
      bands: (radio.bands || []).map((band) => String(band).toUpperCase()),
      price_min_gbp: min,
      price_max_gbp: Math.max(min, max)
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function convertFromGbp(value, currency) {
    const rate = state.rates[currency] || 1;
    return value * rate;
  }

  function convertToGbp(value, currency) {
    const rate = state.rates[currency] || 1;
    return rate === 0 ? value : value / rate;
  }

  function formatCurrency(value, currency) {
    const rounded = Math.round(value);
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(rounded);
    } catch (error) {
      return `${currency} ${rounded}`;
    }
  }

  function getStepSize() {
    return 10 * Math.max(1, Number(state.stepMultiplier) || 1);
  }

  function roundToStep(value, step) {
    return Math.round(value / step) * step;
  }

  function floorToStep(value, step) {
    return Math.floor(value / step) * step;
  }

  function ceilToStep(value, step) {
    return Math.ceil(value / step) * step;
  }

  function getLocalBounds() {
    const step = getStepSize();
    let minLocal = floorToStep(convertFromGbp(state.allMinGbp, state.currency), step);
    let maxLocal = ceilToStep(convertFromGbp(state.allMaxGbp, state.currency), step);

    if (maxLocal <= minLocal) {
      maxLocal = minLocal + step;
    }

    return { minLocal, maxLocal, step };
  }

  function getCurrentLocalRange() {
    const { minLocal, maxLocal, step } = getLocalBounds();
    let currentMinLocal = roundToStep(convertFromGbp(state.minGbp, state.currency), step);
    let currentMaxLocal = roundToStep(convertFromGbp(state.maxGbp, state.currency), step);

    currentMinLocal = clamp(currentMinLocal, minLocal, maxLocal);
    currentMaxLocal = clamp(currentMaxLocal, minLocal, maxLocal);
    if (currentMinLocal > currentMaxLocal) {
      currentMinLocal = currentMaxLocal;
    }

    return {
      minLocal,
      maxLocal,
      step,
      currentMinLocal,
      currentMaxLocal
    };
  }

  function renderCurrencyOptions() {
    currencySelect.innerHTML = state.currencies
      .map((currency) => `<option value="${window.HamUtils.escapeHtml(currency)}">${window.HamUtils.escapeHtml(currency)}</option>`)
      .join('');
  }

  function renderPriceSelectOptions(minLocal, maxLocal, step, selectedMinLocal, selectedMaxLocal) {
    const values = [];
    for (let value = minLocal; value <= maxLocal; value += step) {
      values.push(value);
    }

    minSelect.innerHTML = values
      .map((value) => {
        const selected = value === selectedMinLocal ? 'selected' : '';
        return `<option value="${value}" ${selected}>${window.HamUtils.escapeHtml(formatCurrency(value, state.currency))}</option>`;
      })
      .join('');

    maxSelect.innerHTML = values
      .map((value) => {
        const selected = value === selectedMaxLocal ? 'selected' : '';
        return `<option value="${value}" ${selected}>${window.HamUtils.escapeHtml(formatCurrency(value, state.currency))}</option>`;
      })
      .join('');
  }

  function syncPriceControls() {
    const { minLocal, maxLocal, step, currentMinLocal, currentMaxLocal } = getCurrentLocalRange();

    renderPriceSelectOptions(minLocal, maxLocal, step, currentMinLocal, currentMaxLocal);

    if (minLabel) {
      minLabel.textContent = `From ${formatCurrency(currentMinLocal, state.currency)}`;
    }
    if (maxLabel) {
      maxLabel.textContent = `To ${formatCurrency(currentMaxLocal, state.currency)}`;
    }
  }

  function updatePriceStateFromLocal(localMin, localMax) {
    const bounds = getCurrentLocalRange();
    const minClamped = clamp(localMin, bounds.minLocal, bounds.maxLocal);
    const maxClamped = clamp(localMax, bounds.minLocal, bounds.maxLocal);
    const safeMin = Math.min(minClamped, maxClamped);
    const safeMax = Math.max(minClamped, maxClamped);

    state.minGbp = clamp(convertToGbp(safeMin, state.currency), state.allMinGbp, state.allMaxGbp);
    state.maxGbp = clamp(convertToGbp(safeMax, state.currency), state.allMinGbp, state.allMaxGbp);
  }

  function hasActiveFilters() {
    return (
      Boolean(state.q) ||
      state.tags.size > 0 ||
      state.bands.size > 0 ||
      Math.round(state.minGbp) > Math.round(state.allMinGbp) ||
      Math.round(state.maxGbp) < Math.round(state.allMaxGbp)
    );
  }

  function buildListUrl(overrides) {
    const params = new URLSearchParams();
    const q = overrides?.q ?? state.q;
    const tags = overrides?.tags ?? Array.from(state.tags);
    const bands = overrides?.bands ?? Array.from(state.bands);
    const min = overrides?.minGbp ?? state.minGbp;
    const max = overrides?.maxGbp ?? state.maxGbp;
    const currency = overrides?.currency ?? state.currency;

    if (q) {
      params.set('q', q);
    }
    if (tags.length > 0) {
      params.set('tags', tags.join(','));
    }
    if (bands.length > 0) {
      params.set('bands', bands.join(','));
    }
    if (Math.round(min) > Math.round(state.allMinGbp)) {
      params.set('min', String(Math.round(min)));
    }
    if (Math.round(max) < Math.round(state.allMaxGbp)) {
      params.set('max', String(Math.round(max)));
    }
    if (currency && currency !== 'GBP') {
      params.set('cur', currency);
    }

    const queryString = params.toString();
    return queryString ? `/radios/?${queryString}` : '/radios/';
  }

  function updateQuery() {
    window.history.replaceState({}, '', buildListUrl());
  }

  function readQueryState() {
    const params = new URLSearchParams(window.location.search);
    const tagsParam = params.get('tags') || params.get('tag') || '';
    const bandsParam = params.get('bands') || params.get('band') || '';

    state.q = params.get('q') || '';
    state.tags = new Set(
      tagsParam
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    );
    state.bands = new Set(
      bandsParam
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    );

    const min = Number(params.get('min'));
    const max = Number(params.get('max'));
    state.minGbp = Number.isFinite(min) ? min : state.allMinGbp;
    state.maxGbp = Number.isFinite(max) ? max : state.allMaxGbp;
    state.minGbp = clamp(state.minGbp, state.allMinGbp, state.allMaxGbp);
    state.maxGbp = clamp(state.maxGbp, state.allMinGbp, state.allMaxGbp);
    if (state.minGbp > state.maxGbp) {
      const temp = state.minGbp;
      state.minGbp = state.maxGbp;
      state.maxGbp = temp;
    }

    const queryCurrency = (params.get('cur') || '').toUpperCase();
    if (state.currencies.includes(queryCurrency)) {
      state.currency = queryCurrency;
    }

    state.stepMultiplier = state.stepMultipliers[state.currency] || 1;
  }

  function renderTopTags(radios) {
    const allTags = Array.from(new Set(radios.flatMap((radio) => radio.tags))).sort();
    topTagsContainer.innerHTML = allTags
      .map((tag) => {
        const isActive = state.tags.has(tag);
        return `<button type="button" class="tag tag-toggle${isActive ? ' active' : ''}" data-tag-toggle="${window.HamUtils.escapeHtml(tag)}">${window.HamUtils.escapeHtml(tag)}</button>`;
      })
      .join('');
  }

  function renderBandOptions(radios) {
    const bands = Array.from(new Set(radios.flatMap((radio) => radio.bands))).sort();
    bandOptionsContainer.innerHTML = bands
      .map((band) => {
        const checked = state.bands.has(band);
        return `
          <label class="tag option-toggle${checked ? ' active' : ''}">
            <input type="checkbox" data-band-toggle="${window.HamUtils.escapeHtml(band)}" ${checked ? 'checked' : ''}>
            ${window.HamUtils.escapeHtml(band)}
          </label>
        `;
      })
      .join('');
  }

  function renderActiveFilters() {
    const chips = [];

    if (state.q) {
      chips.push(`<span class="tag active-filter-chip">Search: ${window.HamUtils.escapeHtml(state.q)} <button type="button" data-remove-filter="q">×</button></span>`);
    }

    Array.from(state.tags)
      .sort()
      .forEach((tag) => {
        chips.push(`<span class="tag active-filter-chip">Tag: ${window.HamUtils.escapeHtml(tag)} <button type="button" data-remove-filter="tag:${window.HamUtils.escapeHtml(tag)}">×</button></span>`);
      });

    Array.from(state.bands)
      .sort()
      .forEach((band) => {
        chips.push(`<span class="tag active-filter-chip">Band: ${window.HamUtils.escapeHtml(band)} <button type="button" data-remove-filter="band:${window.HamUtils.escapeHtml(band)}">×</button></span>`);
      });

    if (
      Math.round(state.minGbp) > Math.round(state.allMinGbp) ||
      Math.round(state.maxGbp) < Math.round(state.allMaxGbp)
    ) {
      const minLocal = Math.round(convertFromGbp(state.minGbp, state.currency));
      const maxLocal = Math.round(convertFromGbp(state.maxGbp, state.currency));
      chips.push(`<span class="tag active-filter-chip">Price: ${window.HamUtils.escapeHtml(formatCurrency(minLocal, state.currency))} – ${window.HamUtils.escapeHtml(formatCurrency(maxLocal, state.currency))} <button type="button" data-remove-filter="price">×</button></span>`);
    }

    activeFiltersContainer.innerHTML = chips.length > 0 ? chips.join('') : '<span class="small-text muted">No active filters</span>';
    resetButton.disabled = !hasActiveFilters();
  }

  function formatRadioPrice(radio) {
    const min = Math.round(convertFromGbp(radio.price_min_gbp, state.currency));
    const max = Math.round(convertFromGbp(radio.price_max_gbp, state.currency));
    const primary = `${formatCurrency(min, state.currency)} – ${formatCurrency(max, state.currency)}`;
    return state.currency === 'GBP' ? primary : `${primary} (approx.)`;
  }

  function filterRadios(radios) {
    return radios.filter((radio) => {
      const text = `${radio.name} ${radio.description} ${radio.tags.join(' ')}`.toLowerCase();
      const qMatch = !state.q || text.includes(state.q.toLowerCase());
      const tagMatch = state.tags.size === 0 || radio.tags.some((tag) => state.tags.has(tag));
      const bandMatch = state.bands.size === 0 || radio.bands.some((band) => state.bands.has(band));
      const priceMatch = radio.price_max_gbp >= state.minGbp && radio.price_min_gbp <= state.maxGbp;
      return qMatch && tagMatch && bandMatch && priceMatch;
    });
  }

  function renderList(radios) {
    const filtered = filterRadios(radios);

    if (filtered.length === 0) {
      listContainer.innerHTML = '<p>No radios matched your filters.</p>';
      return;
    }

    listContainer.innerHTML = filtered
      .map(
        (radio) => `
          <article class="card radio-card">
            <img src="${window.HamUtils.escapeHtml(radio.image)}" alt="${window.HamUtils.escapeHtml(radio.name)}" loading="lazy">
            <div>
              <h3>${window.HamUtils.escapeHtml(radio.name)}</h3>
              <p>${window.HamUtils.escapeHtml(radio.description)}</p>
              <p class="small-text">Bands: ${radio.bands.map((band) => window.HamUtils.escapeHtml(band)).join(', ')}</p>
              <p class="small-text">Price: ${window.HamUtils.escapeHtml(formatRadioPrice(radio))}</p>
              <div class="horizontal-flex gap-sm flex-wrap">
                <a class="btn-box btn-sm" href="${window.HamUtils.escapeHtml(radio.affiliate_url)}" target="_blank" rel="noopener noreferrer">Buy →</a>
                <a class="btn-secondary" href="/radios/?slug=${window.HamUtils.escapeHtml(radio.slug)}">Read More →</a>
              </div>
              <div class="tag-list">${radio.tags
                .map((tag) => `<button type="button" class="tag tag-toggle${state.tags.has(tag) ? ' active' : ''}" data-tag-toggle="${window.HamUtils.escapeHtml(tag)}">${window.HamUtils.escapeHtml(tag)}</button>`)
                .join('')}</div>
            </div>
          </article>
        `
      )
      .join('');
  }

  function renderDetail(radios, slug) {
    const radio = radios.find((item) => item.slug === slug);

    if (!radio) {
      detailContainer.innerHTML = '<p>Radio details not found.</p>';
      listContainer.innerHTML = '';
      return;
    }

    const sections = (radio.sections || [])
      .map(
        (section) => `
          <section class="blog-section">
            <h3>${window.HamUtils.escapeHtml(section.heading)}</h3>
            <p>${window.HamUtils.escapeHtml(section.body)}</p>
          </section>
        `
      )
      .join('');

    const specsRows = (radio.specs || [])
      .map(
        (row) => `<tr><th>${window.HamUtils.escapeHtml(row.name)}</th><td>${window.HamUtils.escapeHtml(row.value)}</td></tr>`
      )
      .join('');

    detailContainer.innerHTML = `
      <article class="card">
        <h2>${window.HamUtils.escapeHtml(radio.name)}</h2>
        <p>${window.HamUtils.escapeHtml(radio.description)}</p>
        <p class="small-text">Price: ${window.HamUtils.escapeHtml(formatRadioPrice(radio))}</p>
        <img src="${window.HamUtils.escapeHtml(radio.image)}" alt="${window.HamUtils.escapeHtml(radio.name)}" loading="lazy" class="blog-hero-image">
        ${sections}
        ${specsRows ? `<section class="blog-section"><h3>Specifications</h3><table class="spec-table"><tbody>${specsRows}</tbody></table></section>` : ''}
        <section class="blog-section">
          <h3>Tags</h3>
          <div class="tag-list">${radio.tags
            .map((tag) => `<a class="tag tag-link" href="${buildListUrl({ tags: [tag] })}">${window.HamUtils.escapeHtml(tag)}</a>`)
            .join('')}</div>
        </section>
        <div class="horizontal-flex gap-sm flex-wrap action-row-center">
          <a class="btn-box btn-sm" href="${window.HamUtils.escapeHtml(radio.affiliate_url)}" target="_blank" rel="noopener noreferrer">Buy →</a>
          <a class="btn-secondary" href="${buildListUrl()}">Back to Radios</a>
        </div>
      </article>
    `;

    listContainer.innerHTML = '';
  }

  function syncControls(radios) {
    renderTopTags(radios);
    renderBandOptions(radios);
    syncPriceControls();
    renderActiveFilters();
    searchInput.value = state.q;
    currencySelect.value = state.currency;
  }

  function applyAndRender(radios) {
    syncControls(radios);
    renderList(radios);
    updateQuery();
  }

  async function loadCurrencyConfig() {
    try {
      const config = await window.HamUtils.fetchJson('/data/currency.json');
      const supported = Array.isArray(config.supported)
        ? config.supported.map((item) => String(item).toUpperCase()).filter(Boolean)
        : [...defaultCurrencies];
      const stepMultipliers = { ...defaultStepMultipliers, ...(config.step_multiplier || {}) };
      return {
        supported: supported.length > 0 ? supported : [...defaultCurrencies],
        stepMultipliers
      };
    } catch (error) {
      return {
        supported: [...defaultCurrencies],
        stepMultipliers: { ...defaultStepMultipliers }
      };
    }
  }

  async function getDefaultCurrencyFromLocation() {
    try {
      const location = await window.HamUtils.fetchJson('/api/location');
      const countryCode = String(location.country || '').toUpperCase();
      return countryToCurrency[countryCode] || 'GBP';
    } catch (error) {
      return 'GBP';
    }
  }

  async function loadRates(baseCurrency, symbols) {
    const query = encodeURIComponent(symbols.join(','));
    try {
      const data = await window.HamUtils.fetchJson(`/api/rates?base=${encodeURIComponent(baseCurrency)}&symbols=${query}`);
      const rates = { ...fallbackRates, ...(data.rates || {}) };
      rates[baseCurrency] = 1;
      return rates;
    } catch (error) {
      return { ...fallbackRates };
    }
  }

  try {
    const [data, currencyConfig] = await Promise.all([
      window.HamUtils.fetchJson('/data/radios.json'),
      loadCurrencyConfig()
    ]);
    const radios = (data.radios || []).map(normalizeRadio);

    if (radios.length === 0) {
      listContainer.innerHTML = '<p>No radios available.</p>';
      return;
    }

    state.currencies = currencyConfig.supported;
    state.stepMultipliers = currencyConfig.stepMultipliers;

    renderCurrencyOptions();

    state.allMinGbp = Math.min(...radios.map((radio) => radio.price_min_gbp));
    state.allMaxGbp = Math.max(...radios.map((radio) => radio.price_max_gbp));
    state.minGbp = state.allMinGbp;
    state.maxGbp = state.allMaxGbp;

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    const queryCurrency = (params.get('cur') || '').toUpperCase();

    if (!state.currencies.includes(queryCurrency)) {
      state.currency = await getDefaultCurrencyFromLocation();
      if (!state.currencies.includes(state.currency)) {
        state.currency = 'GBP';
      }
    }

    state.rates = await loadRates('GBP', state.currencies.filter((currency) => currency !== 'GBP'));

    if (state.currencies.includes(queryCurrency)) {
      state.currency = queryCurrency;
    }
    state.stepMultiplier = state.stepMultipliers[state.currency] || 1;

    readQueryState();

    if (slug) {
      syncControls(radios);
      renderDetail(radios, slug);
      return;
    }

    detailContainer.innerHTML = '';
    applyAndRender(radios);

    searchInput.addEventListener('input', () => {
      state.q = searchInput.value.trim();
      applyAndRender(radios);
    });

    currencySelect.addEventListener('change', () => {
      state.currency = state.currencies.includes(currencySelect.value) ? currencySelect.value : 'GBP';
      state.stepMultiplier = state.stepMultipliers[state.currency] || 1;
      syncControls(radios);
      renderList(radios);
      updateQuery();
    });

    minSelect.addEventListener('change', () => {
      let localMin = Number(minSelect.value);
      let localMax = Number(maxSelect.value);
      if (localMin > localMax) {
        localMax = localMin;
      }
      updatePriceStateFromLocal(localMin, localMax);
      applyAndRender(radios);
    });

    maxSelect.addEventListener('change', () => {
      let localMin = Number(minSelect.value);
      let localMax = Number(maxSelect.value);
      if (localMax < localMin) {
        localMin = localMax;
      }
      updatePriceStateFromLocal(localMin, localMax);
      applyAndRender(radios);
    });

    topTagsContainer.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-tag-toggle]');
      if (!trigger) {
        return;
      }

      const tag = (trigger.getAttribute('data-tag-toggle') || '').toLowerCase();
      if (!tag) {
        return;
      }

      if (state.tags.has(tag)) {
        state.tags.delete(tag);
      } else {
        state.tags.add(tag);
      }
      applyAndRender(radios);
    });

    listContainer.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-tag-toggle]');
      if (!trigger) {
        return;
      }

      const tag = (trigger.getAttribute('data-tag-toggle') || '').toLowerCase();
      if (!tag) {
        return;
      }

      if (state.tags.has(tag)) {
        state.tags.delete(tag);
      } else {
        state.tags.add(tag);
      }
      applyAndRender(radios);
    });

    bandOptionsContainer.addEventListener('change', (event) => {
      const trigger = event.target.closest('[data-band-toggle]');
      if (!trigger) {
        return;
      }

      const band = (trigger.getAttribute('data-band-toggle') || '').toUpperCase();
      if (!band) {
        return;
      }

      if (trigger.checked) {
        state.bands.add(band);
      } else {
        state.bands.delete(band);
      }
      applyAndRender(radios);
    });

    activeFiltersContainer.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-remove-filter]');
      if (!trigger) {
        return;
      }

      const remove = trigger.getAttribute('data-remove-filter') || '';
      if (remove === 'q') {
        state.q = '';
      } else if (remove === 'price') {
        state.minGbp = state.allMinGbp;
        state.maxGbp = state.allMaxGbp;
      } else if (remove.startsWith('tag:')) {
        state.tags.delete(remove.slice(4).toLowerCase());
      } else if (remove.startsWith('band:')) {
        state.bands.delete(remove.slice(5).toUpperCase());
      }
      applyAndRender(radios);
    });

    resetButton.addEventListener('click', () => {
      state.q = '';
      state.tags = new Set();
      state.bands = new Set();
      state.minGbp = state.allMinGbp;
      state.maxGbp = state.allMaxGbp;
      applyAndRender(radios);
    });
  } catch (error) {
    console.error(error);
    listContainer.innerHTML = '<p>Could not load radio recommendations.</p>';
    detailContainer.innerHTML = '';
  }
})();
