(function () {
  const STORAGE_KEYS = {
    latest: 'ham_latest_csv_generation',
    localDirectory: 'ham_csv_directory_local'
  };

  const CHIRP_HEADERS = [
    'Location', 'Name', 'Frequency', 'Duplex', 'Offset', 'Tone', 'rToneFreq', 'cToneFreq', 'DtcsCode', 'DtcsPolarity', 'Mode', 'TStep', 'Skip', 'Comment', 'URCALL', 'RPT1CALL', 'RPT2CALL', 'DVCODE'
  ];

  const VALIDATION_DESCRIPTIONS = {
    none: 'None: Parses JSON and keeps most rows. Fastest, least strict.',
    standard: 'Standard: Validates shape/mode/range and removes duplicates.',
    strict: 'Strict: Excludes any uncertain rows and fails generation when issues exist.'
  };

  const form = document.getElementById('chirp-form');
  if (!form) return;

  const statusBox = document.getElementById('generation-status');
  const generationActions = document.getElementById('generation-actions');
  const retryGenerateButton = document.getElementById('retry-generate-btn');
  const retryNextModelButton = document.getElementById('retry-next-model-btn');
  const retryHint = document.getElementById('retry-hint');
  const debugPanel = document.getElementById('debug-panel');
  const debugOutput = document.getElementById('debug-output');
  const validationReport = document.getElementById('validation-report');
  const previewWrap = document.getElementById('preview-table-wrap');
  const generateButton = document.getElementById('generate-btn');
  const downloadButton = document.getElementById('download-btn');

  const providerInput = document.getElementById('provider');
  const modelInput = document.getElementById('model');
  const apiKeyInput = document.getElementById('api-key');
  const webSearchInput = document.getElementById('enable-web-search');
  const webSearchDescription = document.getElementById('web-search-description');
  const locationInput = document.getElementById('location');
  const promptInput = document.getElementById('prompt');
  const refreshModelsButton = document.getElementById('refresh-models-btn');
  const validationInput = document.getElementById('validation-level');
  const validationDescription = document.getElementById('validation-description');
  const templateInput = document.getElementById('prompt-template');

  const rotateTemplateButton = document.getElementById('rotate-template-btn');
  const applyTemplateButton = document.getElementById('apply-template-btn');
  const loadSessionKeyButton = document.getElementById('load-session-key-btn');
  const saveAccountKeyButton = document.getElementById('save-account-key-btn');
  const loadAccountKeyButton = document.getElementById('load-account-key-btn');

  let optionsConfig = null;
  let errorHandlingConfig = { rules: [] };
  let lastMatchedErrorRule = null;
  let templateIndex = 0;
  let latestCsvContent = '';
  let latestMeta = null;
  let modelDiscoveryInFlight = false;

  function normalizeModelOption(modelOption) {
    if (typeof modelOption === 'string') {
      return {
        id: modelOption,
        label: modelOption,
        web_search_available: true
      };
    }

    const id = String(modelOption?.id || '').trim();
    if (!id) {
      return null;
    }

    return {
      id,
      label: String(modelOption?.label || id),
      web_search_available: modelOption?.web_search_available !== false
    };
  }

  function getProviderConfig(providerId) {
    const provider = String(providerId || providerInput?.value || '').toLowerCase();
    return optionsConfig?.providers?.[provider] || null;
  }

  function getProviderModelOptions(providerId) {
    const providerConfig = getProviderConfig(providerId);
    const rawModels = Array.isArray(providerConfig?.models) ? providerConfig.models : [];
    return rawModels
      .map((item) => normalizeModelOption(item))
      .filter(Boolean);
  }

  function getSelectedModelConfig() {
    const selectedModel = String(modelInput?.value || '').trim();
    const modelOptions = getProviderModelOptions(providerInput?.value);
    return modelOptions.find((item) => item.id === selectedModel) || null;
  }

  function updateModelDiscoveryVisibility() {
    if (!refreshModelsButton) {
      return;
    }
    const provider = String(providerInput?.value || '').toLowerCase();
    refreshModelsButton.hidden = provider !== 'github';
  }

  function syncWebSearchAvailability() {
    if (!webSearchInput) {
      return;
    }

    const selectedModel = getSelectedModelConfig();
    const available = selectedModel?.web_search_available !== false;

    webSearchInput.disabled = !available;
    if (!available) {
      webSearchInput.checked = false;
    }

    if (webSearchDescription) {
      webSearchDescription.textContent = available
        ? 'Available for selected model.'
        : 'Not available for selected model.';
    }
  }

  function setStatus(message) {
    if (statusBox) statusBox.textContent = message;
  }

  function clearRecoveryAction() {
    lastMatchedErrorRule = null;
    if (generationActions) {
      generationActions.hidden = true;
    }
    if (retryGenerateButton) {
      retryGenerateButton.textContent = 'Try again';
      retryGenerateButton.disabled = false;
    }
    if (retryHint) {
      retryHint.textContent = '';
    }
    if (retryNextModelButton) {
      retryNextModelButton.hidden = true;
      retryNextModelButton.textContent = 'Try different model';
      retryNextModelButton.disabled = false;
    }
  }

  function showRecoveryAction(rule) {
    if (!generationActions || !retryGenerateButton) {
      return;
    }

    if (!rule || !rule.retryable) {
      clearRecoveryAction();
      return;
    }

    lastMatchedErrorRule = rule;
    retryGenerateButton.textContent = String(rule.action_label || 'Try again');
    retryHint.textContent = String(rule.hint || '');

    const secondaryAction = rule?.secondary_action || null;
    if (retryNextModelButton) {
      const isNextModelAction = secondaryAction?.type === 'next_model';
      retryNextModelButton.hidden = !isNextModelAction;
      if (isNextModelAction) {
        retryNextModelButton.textContent = String(secondaryAction?.label || 'Try different model');
      }
    }

    generationActions.hidden = false;
  }

  function selectNextModel() {
    if (!modelInput) {
      return false;
    }

    const options = Array.from(modelInput.options || []);
    if (options.length < 2) {
      return false;
    }

    const currentIndex = options.findIndex((option) => option.value === modelInput.value);
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeCurrentIndex + 1) % options.length;
    const nextValue = String(options[nextIndex]?.value || '').trim();

    if (!nextValue || nextValue === modelInput.value) {
      return false;
    }

    modelInput.value = nextValue;
    syncWebSearchAvailability();
    return true;
  }

  function clearDebugDetails() {
    if (debugPanel) {
      debugPanel.hidden = true;
      debugPanel.open = false;
    }
    if (debugOutput) {
      debugOutput.textContent = '';
    }
  }

  function renderDebugDetails(payload) {
    if (!debugPanel || !debugOutput) {
      return;
    }
    debugOutput.textContent = JSON.stringify(payload, null, 2);
    debugPanel.hidden = false;
  }

  function parseStatusCode(message) {
    const match = String(message || '').match(/\b([45]\d{2})\b/);
    return match ? Number(match[1]) : null;
  }

  function matchRule(rule, message, statusCode) {
    const match = rule?.match || {};
    const text = String(message || '').toLowerCase();
    const contains = Array.isArray(match.contains) ? match.contains : [];
    const statusCodes = Array.isArray(match.status_codes) ? match.status_codes : [];

    if (statusCodes.length > 0 && statusCode !== null && statusCodes.includes(statusCode)) {
      return true;
    }

    if (contains.length > 0 && contains.some((item) => text.includes(String(item || '').toLowerCase()))) {
      return true;
    }

    return false;
  }

  function findErrorRule(errorMessage) {
    const rules = Array.isArray(errorHandlingConfig?.rules) ? errorHandlingConfig.rules : [];
    const statusCode = parseStatusCode(errorMessage);
    return rules.find((rule) => matchRule(rule, errorMessage, statusCode)) || null;
  }

  function setPending(isPending) {
    generateButton.disabled = isPending;
    generateButton.textContent = isPending ? 'Generating…' : 'Generate CSV';
  }

  function parseOptionalNumber(raw) {
    const text = String(raw || '').trim();
    if (!text || text.toLowerCase() === 'any') return null;
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`Invalid number: ${text}`);
    return value;
  }

  function parseJsonContent(text) {
    const stripped = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const firstObject = stripped.indexOf('{');
    const firstArray = stripped.indexOf('[');
    const start = firstObject === -1 ? firstArray : (firstArray === -1 ? firstObject : Math.min(firstObject, firstArray));
    if (start === -1) throw new Error('No JSON found in model response.');
    const candidate = stripped.slice(start);
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (end === -1) throw new Error('Incomplete JSON in model response.');
    return JSON.parse(candidate.slice(0, end + 1));
  }

  function readChecked(name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
  }

  function normalizeMode(mode) {
    const normalized = String(mode || '').trim().toUpperCase();
    if (normalized === 'DMR') return 'DV';
    if (normalized === 'SSB') return 'USB';
    return normalized;
  }

  function escapeCsvCell(value) {
    const text = String(value ?? '');
    const escaped = text.replace(/"/g, '""');
    if (/^[=+\-@]/.test(escaped)) return `'${escaped}`;
    if (/[",\n]/.test(escaped)) return `"${escaped}"`;
    return escaped;
  }

  function buildCsv(channels) {
    const rows = [CHIRP_HEADERS.join(',')];
    channels.forEach((channel, index) => {
      rows.push([
        index,
        channel.name,
        channel.frequency.toFixed(4),
        channel.duplex,
        Number(channel.offset || 0).toFixed(6),
        channel.tone_mode,
        Number(channel.r_tone_freq || 88.5).toFixed(1),
        Number(channel.t_tone_freq || 88.5).toFixed(1),
        String(Math.round(channel.dtcs_code || 23)).padStart(3, '0'),
        'NN',
        channel.mode || 'FM',
        '5.00',
        '',
        channel.comment || '',
        '',
        '',
        '',
        ''
      ].map(escapeCsvCell).join(','));
    });
    return rows.join('\n');
  }

  function buildPrompt(formOptions) {
    const rangeText = formOptions.freqMin === null && formOptions.freqMax === null
      ? 'Any frequency range'
      : `${formOptions.freqMin === null ? 'Any' : formOptions.freqMin} MHz to ${formOptions.freqMax === null ? 'Any' : formOptions.freqMax} MHz`;
    const channelText = formOptions.numChannels === null ? 'no strict max limit' : `maximum ${formOptions.numChannels} channels`;

    return `You are an expert amateur radio frequency database assistant.
Generate a CHIRP-compatible list for ${formOptions.location} with ${channelText}.

REQUIREMENTS:
- Region/Location: ${formOptions.location}
- Frequency range: ${rangeText}
- Modes: ${formOptions.selectedModes.join(', ')}
- Include repeaters: ${formOptions.includeRepeaters ? 'Yes' : 'No'}
- Bands: ${formOptions.selectedBands.join(', ')}
- Web search enabled: ${formOptions.webSearch ? 'Yes' : 'No'}

USER REQUEST:
${formOptions.userPrompt}

Return JSON only:
{
  "title": "short title",
  "list_description": "description paragraph",
  "keywords": ["keyword1", "keyword2"],
  "channels": [{
    "name":"max 8 chars",
    "frequency":145.500,
    "duplex":"",
    "offset":0.600,
    "tone_mode":"",
    "r_tone_freq":88.5,
    "t_tone_freq":88.5,
    "dtcs_code":23,
    "mode":"FM",
    "comment":"brief"
  }]
}`;
  }

  function normalizeKeywords(rawKeywords, formOptions) {
    const source = Array.isArray(rawKeywords) ? rawKeywords : String(rawKeywords || '').split(',');
    const extra = [
      ...formOptions.selectedModes,
      ...formOptions.selectedBands,
      ...String(formOptions.location || '').toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean)
    ];
    return [...source, ...extra]
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
      .filter((item, index, array) => array.indexOf(item) === index)
      .slice(0, 24);
  }

  function renderPreview(channels, listDescription, keywords) {
    if (!channels.length) {
      previewWrap.textContent = 'No preview available.';
      return;
    }

    const rows = channels.slice(0, 120).map((channel) => `
      <tr>
        <td>${window.HamUtils.escapeHtml(channel.name)}</td>
        <td>${channel.frequency.toFixed(4)}</td>
        <td>${window.HamUtils.escapeHtml(channel.mode)}</td>
        <td>${window.HamUtils.escapeHtml(channel.duplex || '')}</td>
        <td>${window.HamUtils.escapeHtml(channel.comment || '')}</td>
      </tr>
    `).join('');

    previewWrap.innerHTML = `
      <p><strong>Description:</strong> ${window.HamUtils.escapeHtml(listDescription || 'No description returned.')}</p>
      <p><strong>Keywords:</strong> ${window.HamUtils.escapeHtml((keywords || []).join(', ') || 'none')}</p>
      <table class="spec-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Frequency</th>
            <th>Mode</th>
            <th>Duplex</th>
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderValidation(report, formOptions) {
    validationReport.innerHTML = [
      `<p>${window.HamUtils.escapeHtml(VALIDATION_DESCRIPTIONS[formOptions.validationLevel] || '')}</p>`,
      `<p>Valid channels: <strong>${report.validCount}</strong></p>`,
      `<p>Invalid channels removed: <strong>${report.invalid.length}</strong></p>`,
      `<p>Duplicates removed: <strong>${report.duplicates}</strong></p>`
    ].join('');
  }

  function updateValidationDescription() {
    if (validationDescription && validationInput) {
      validationDescription.textContent = VALIDATION_DESCRIPTIONS[validationInput.value] || '';
    }
  }

  function normalizeChannel(raw, requestedModes, formOptions, report) {
    const channel = {
      name: String(raw?.name || '').trim().toUpperCase().slice(0, 8),
      frequency: Number(raw?.frequency),
      duplex: ['', '+', '-', 'split'].includes(String(raw?.duplex || '').trim()) ? String(raw?.duplex || '').trim() : '',
      offset: Number.isFinite(Number(raw?.offset)) ? Math.max(0, Number(raw?.offset)) : 0,
      tone_mode: ['', 'Tone', 'TSQL', 'DTCS'].includes(String(raw?.tone_mode || '').trim()) ? String(raw?.tone_mode || '').trim() : '',
      r_tone_freq: Number.isFinite(Number(raw?.r_tone_freq)) ? Number(raw?.r_tone_freq) : 88.5,
      t_tone_freq: Number.isFinite(Number(raw?.t_tone_freq)) ? Number(raw?.t_tone_freq) : 88.5,
      dtcs_code: Number.isFinite(Number(raw?.dtcs_code)) ? Number(raw?.dtcs_code) : 23,
      mode: normalizeMode(raw?.mode || 'FM'),
      comment: String(raw?.comment || '').trim().slice(0, 200)
    };

    const issues = [];
    if (!channel.name) issues.push('name missing');
    if (!Number.isFinite(channel.frequency)) issues.push('frequency missing');
    if (formOptions.freqMin !== null && Number.isFinite(channel.frequency) && channel.frequency < formOptions.freqMin) issues.push('below min frequency');
    if (formOptions.freqMax !== null && Number.isFinite(channel.frequency) && channel.frequency > formOptions.freqMax) issues.push('above max frequency');
    if (requestedModes.length > 0 && !requestedModes.includes(channel.mode)) issues.push(`mode ${channel.mode} not requested`);
    if (!formOptions.includeRepeaters && ['+', '-', 'split'].includes(channel.duplex)) issues.push('repeater not allowed');

    if (formOptions.validationLevel === 'none') {
      if (!Number.isFinite(channel.frequency)) {
        report.invalid.push({ name: channel.name || '(unnamed)', issues: ['frequency missing'] });
        return null;
      }
      if (!channel.name) channel.name = `CH${Math.round(channel.frequency * 1000)}`.slice(0, 8);
      return channel;
    }

    if (issues.length) {
      report.invalid.push({ name: channel.name || '(unnamed)', issues });
      return null;
    }

    return channel;
  }

  function dedupeChannels(channels, report) {
    const seen = new Set();
    return channels.filter((channel) => {
      const key = `${channel.name.toLowerCase()}::${channel.frequency.toFixed(4)}`;
      if (seen.has(key)) {
        report.duplicates += 1;
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function readFormOptions() {
    const provider = String(providerInput?.value || 'openai').trim().toLowerCase();
    const model = String(modelInput?.value || '').trim();
    const apiKey = String(apiKeyInput?.value || '').trim();
    const freqMin = parseOptionalNumber(document.getElementById('freq-min')?.value);
    const freqMax = parseOptionalNumber(document.getElementById('freq-max')?.value);
    const numChannels = parseOptionalNumber(document.getElementById('num-channels')?.value);
    const selectedModes = readChecked('modes');
    const selectedBandsRaw = readChecked('bands');
    const selectedBands = selectedBandsRaw.includes('All') || !selectedBandsRaw.length ? ['HF', 'VHF', 'UHF'] : selectedBandsRaw;

    const includeRepeaters = String(document.getElementById('include-repeaters')?.value || 'yes') === 'yes';
    const location = String(locationInput?.value || '').trim();
    const validationLevel = String(validationInput?.value || 'standard');
    const userPrompt = String(promptInput?.value || '').trim();
    const selectedModelConfig = getSelectedModelConfig();
    const webSearchAvailable = selectedModelConfig?.web_search_available !== false;
    const webSearch = Boolean(webSearchInput?.checked) && webSearchAvailable;

    if (!apiKey) throw new Error('Enter your API key before generating.');
    if (!location) throw new Error('Location is required.');
    if (freqMin !== null && freqMax !== null && freqMin >= freqMax) throw new Error('Min frequency must be lower than max frequency.');
    if (!selectedModes.length) throw new Error('Select at least one mode.');
    if (numChannels !== null && numChannels <= 0) throw new Error('Max channels must be greater than zero.');

    return {
      provider,
      model,
      apiKey,
      freqMin,
      freqMax,
      numChannels,
      selectedModes,
      selectedBands,
      includeRepeaters,
      location,
      validationLevel,
      userPrompt,
      webSearch
    };
  }

  async function callLlmProvider(payload) {
    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detailText = String(json.details || '').trim();
      const message = detailText
        ? `${json.error || `LLM request failed (${response.status})`} — ${detailText}`
        : (json.error || `LLM request failed (${response.status})`);
      const error = new Error(message);
      error.status = response.status;
      error.response = json;
      throw error;
    }
    if (!json.content) throw new Error('LLM did not return content.');
    return json;
  }

  async function getFirebaseState() {
    if (!window.HamFirebase || typeof window.HamFirebase.init !== 'function') return { available: false };
    const state = await window.HamFirebase.init();
    if (!state.available || !state.db || !state.storage) return { available: false };
    return { available: true, db: state.db, storage: state.storage, auth: state.auth || null };
  }

  function addLocalDirectoryEntry(entry) {
    try {
      const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.localDirectory) || '[]');
      existing.unshift(entry);
      window.localStorage.setItem(STORAGE_KEYS.localDirectory, JSON.stringify(existing.slice(0, 250)));
    } catch (_error) {}
  }

  async function persistGeneration(csvContent, channels, formOptions, metadata) {
    const csvId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = new Date().toISOString();
    const tags = normalizeKeywords(metadata.keywords, formOptions);

    const entry = {
      id: csvId,
      title: String(metadata.title || `${formOptions.location} list`).slice(0, 120),
      description: String(metadata.listDescription || formOptions.userPrompt || ''),
      csv_storage_path: `csvs/${csvId}.csv`,
      metadata: {
        num_channels: channels.length,
        freq_min: formOptions.freqMin,
        freq_max: formOptions.freqMax,
        modes: formOptions.selectedModes,
        includes_repeaters: formOptions.includeRepeaters,
        bands: formOptions.selectedBands,
        location: formOptions.location,
        llm_provider: formOptions.provider,
        llm_model: formOptions.model,
        validation_level: formOptions.validationLevel,
        web_search_enabled: formOptions.webSearch
      },
      created_at: createdAt,
      created_by: null,
      download_count: 0,
      tags,
      preview_channels: channels.slice(0, 40)
    };

    const firebase = await getFirebaseState();
    if (!firebase.available) {
      addLocalDirectoryEntry({ ...entry, csv_content: csvContent, source: 'local' });
      return { saved: false };
    }

    const user = firebase.auth ? firebase.auth.currentUser : null;
    if (user?.uid) entry.created_by = user.uid;

    try {
      const fileRef = firebase.storage.ref().child(entry.csv_storage_path);
      await fileRef.putString(csvContent, 'raw', { contentType: 'text/csv' });
      entry.csv_download_url = await fileRef.getDownloadURL();
    } catch (_error) {
      entry.csv_storage_path = '';
    }

    await firebase.db.collection('csv_directory').doc(csvId).set(entry);

    if (user?.uid) {
      await firebase.db.collection('users').doc(user.uid).collection('saved_csvs').doc(csvId).set({
        csv_id: csvId,
        title: entry.title,
        generated_at: createdAt
      });
    }

    addLocalDirectoryEntry({ ...entry, source: 'firebase' });
    return { saved: true };
  }

  function saveLatestToSession(meta, csvContent) {
    window.sessionStorage.setItem(STORAGE_KEYS.latest, JSON.stringify({ ...meta, csv_content: csvContent, updated_at: new Date().toISOString() }));
  }

  function restoreLatestFromSession() {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEYS.latest);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.csv_content) return;
      latestCsvContent = parsed.csv_content;
      latestMeta = parsed;
      downloadButton.disabled = false;
      setStatus('Restored your latest generated CSV from this session.');
    } catch (_error) {}
  }

  async function detectLocation() {
    if (!locationInput || locationInput.value.trim()) return;
    try {
      const response = await fetch('/api/location', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const parts = [data.city, data.region, data.country].map((item) => String(item || '').trim()).filter((item) => item && item.toLowerCase() !== 'unknown');
      locationInput.value = parts.length ? parts.join(', ') : 'United Kingdom';
    } catch (_error) {
      locationInput.value = 'United Kingdom';
    }
  }

  function renderModelOptions() {
    if (!providerInput || !modelInput) return;
    const provider = String(providerInput.value || '').toLowerCase();
    const providerConfig = getProviderConfig(provider);
    const models = getProviderModelOptions(provider);
    const currentSelection = String(modelInput.value || '').trim();
    const defaultModel = String(providerConfig?.default_model || models[0]?.id || '').trim();

    modelInput.innerHTML = models
      .map((model) => `<option value="${window.HamUtils.escapeHtml(model.id)}">${window.HamUtils.escapeHtml(model.label)}</option>`)
      .join('');

    const hasCurrent = models.some((model) => model.id === currentSelection);
    modelInput.value = hasCurrent ? currentSelection : defaultModel;
    syncWebSearchAvailability();
  }

  function replaceProviderModels(providerId, models) {
    const provider = String(providerId || '').toLowerCase();
    if (!provider || !optionsConfig?.providers?.[provider]) {
      return false;
    }

    const normalized = (Array.isArray(models) ? models : [])
      .map((item) => normalizeModelOption(item))
      .filter(Boolean);

    if (!normalized.length) {
      return false;
    }

    optionsConfig.providers[provider].models = normalized;
    const currentDefault = String(optionsConfig.providers[provider].default_model || '').trim();
    if (!normalized.some((item) => item.id === currentDefault)) {
      optionsConfig.providers[provider].default_model = normalized[0].id;
    }

    return true;
  }

  async function fetchProviderModels(provider, apiKey) {
    const response = await fetch('/api/llm/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey })
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(json.details || '').trim();
      const message = detail
        ? `${json.error || `Model list request failed (${response.status})`} — ${detail}`
        : (json.error || `Model list request failed (${response.status})`);
      const error = new Error(message);
      error.status = response.status;
      error.response = json;
      throw error;
    }

    if (!Array.isArray(json.models) || json.models.length === 0) {
      throw new Error('No models returned for this provider/key.');
    }

    return json.models;
  }

  async function handleRefreshModels(options = {}) {
    const auto = Boolean(options.auto);

    if (modelDiscoveryInFlight) {
      return false;
    }

    const provider = String(providerInput?.value || '').trim().toLowerCase();
    const apiKey = String(apiKeyInput?.value || '').trim();

    if (!provider) {
      if (!auto) setStatus('Select a provider first.');
      return false;
    }
    if (provider !== 'github') {
      return false;
    }
    if (!apiKey) {
      if (!auto) {
        setStatus('Enter API key first to fetch available models.');
      }
      return false;
    }

    modelDiscoveryInFlight = true;
    if (refreshModelsButton) {
      refreshModelsButton.disabled = true;
      refreshModelsButton.textContent = auto ? 'Refreshing…' : 'Loading models…';
    }

    try {
      const models = await fetchProviderModels(provider, apiKey);
      const updated = replaceProviderModels(provider, models);
      if (!updated) {
        throw new Error('Unable to apply fetched model list.');
      }

      renderModelOptions();
      setStatus(`Loaded ${models.length} models for ${provider}.`);
      return true;
    } catch (error) {
      const message = error?.message || 'Unable to load provider model list.';
      setStatus(auto ? `${message} Using configured model list.` : message);
      return false;
    } finally {
      modelDiscoveryInFlight = false;
      if (refreshModelsButton) {
        refreshModelsButton.disabled = false;
        refreshModelsButton.textContent = 'Load available models';
      }
    }
  }

  function renderTemplateOptions() {
    if (!templateInput) return;
    const templates = optionsConfig?.prompt_templates || [];
    templateInput.innerHTML = templates.map((_, index) => `<option value="${index}">Template ${index + 1}</option>`).join('');
    templateInput.value = String(templateIndex);
  }

  function applyTemplate(index) {
    const templates = optionsConfig?.prompt_templates || [];
    if (!templates.length || !promptInput) return;
    templateIndex = ((Number(index) || 0) + templates.length) % templates.length;
    templateInput.value = String(templateIndex);
    const location = String(locationInput?.value || '{location}').trim() || '{location}';
    promptInput.value = String(templates[templateIndex]).replace(/\{location\}/gi, location);
  }

  async function loadOptionsConfig() {
    try {
      const response = await fetch('/data/chirp-options.json', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      optionsConfig = await response.json();
    } catch (_error) {
      optionsConfig = {
        providers: {
          openai: { models: [{ id: 'gpt-5-mini', label: 'gpt-5-mini', web_search_available: true }], default_model: 'gpt-5-mini' },
          gemini: { models: [{ id: 'gemini-2.0-flash', label: 'gemini-2.0-flash', web_search_available: true }], default_model: 'gemini-2.0-flash' },
          claude: { models: [{ id: 'claude-sonnet-4-20250514', label: 'claude-sonnet-4-20250514', web_search_available: true }], default_model: 'claude-sonnet-4-20250514' },
          grok: { models: [{ id: 'grok-3-mini', label: 'grok-3-mini', web_search_available: true }], default_model: 'grok-3-mini' },
          github: {
            models: [
              { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini', web_search_available: false },
              { id: 'gpt-4.1', label: 'gpt-4.1', web_search_available: false },
              { id: 'gpt-4.1-nano', label: 'gpt-4.1-nano', web_search_available: false },
              { id: 'gpt-4o-mini', label: 'gpt-4o-mini', web_search_available: false },
              { id: 'gpt-4o', label: 'gpt-4o', web_search_available: false },
              { id: 'Meta-Llama-3.1-8B-Instruct', label: 'Meta-Llama-3.1-8B-Instruct', web_search_available: false },
              { id: 'Meta-Llama-3.1-70B-Instruct', label: 'Meta-Llama-3.1-70B-Instruct', web_search_available: false },
              { id: 'Mistral-large-2411', label: 'Mistral-large-2411', web_search_available: false },
              { id: 'Phi-3.5-mini-instruct', label: 'Phi-3.5-mini-instruct', web_search_available: false }
            ],
            default_model: 'gpt-4.1-mini'
          }
        },
        prompt_templates: ['Interesting radio frequencies local to {location}.']
      };
    }
  }

  async function loadErrorHandlingConfig() {
    try {
      const response = await fetch('/data/chirp-error-handling.json', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const config = await response.json();
      errorHandlingConfig = {
        rules: Array.isArray(config?.rules) ? config.rules : []
      };
    } catch (_error) {
      errorHandlingConfig = {
        rules: [
          {
            id: 'no-valid-channels',
            match: { contains: ['No valid channels after validation'] },
            retryable: true,
            action_label: 'Try again',
            hint: 'Try again with broader filters or another model.'
          },
          {
            id: 'rate-limit-429',
            match: { status_codes: [429], contains: ['rate'] },
            retryable: true,
            action_label: 'Try again',
            hint: 'Wait a moment and retry.'
          },
          {
            id: 'unknown-model',
            match: { contains: ['unknown_model', 'Unknown model'] },
            retryable: true,
            action_label: 'Try again',
            hint: 'Selected model is not available for this provider/key.',
            secondary_action: {
              type: 'next_model',
              label: 'Try different model'
            }
          }
        ]
      };
    }
  }

  async function loadSessionKeyForProvider() {
    if (!window.HamKeyStore || !providerInput || !apiKeyInput) return;
    const key = await window.HamKeyStore.getSessionKey(providerInput.value);
    apiKeyInput.value = key || '';
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setPending(true);
    downloadButton.disabled = true;
    clearRecoveryAction();
    clearDebugDetails();

    const debugContext = {
      started_at: new Date().toISOString()
    };

    try {
      const formOptions = readFormOptions();
      if (window.HamKeyStore) await window.HamKeyStore.saveSessionKey(formOptions.provider, formOptions.apiKey);

      debugContext.form = {
        provider: formOptions.provider,
        model: formOptions.model,
        freq_min: formOptions.freqMin,
        freq_max: formOptions.freqMax,
        max_channels: formOptions.numChannels,
        selected_modes: formOptions.selectedModes,
        selected_bands: formOptions.selectedBands,
        include_repeaters: formOptions.includeRepeaters,
        location: formOptions.location,
        validation_level: formOptions.validationLevel,
        web_search: formOptions.webSearch,
        prompt_preview: String(formOptions.userPrompt || '').slice(0, 400)
      };

      setStatus('Calling LLM provider…');
      const llmResult = await callLlmProvider({
        provider: formOptions.provider,
        api_key: formOptions.apiKey,
        model: formOptions.model,
        web_search: formOptions.webSearch,
        prompt: buildPrompt(formOptions),
        request_meta: {
          freq_min: formOptions.freqMin,
          freq_max: formOptions.freqMax,
          modes: formOptions.selectedModes,
          bands: formOptions.selectedBands,
          include_repeaters: formOptions.includeRepeaters,
          validation_level: formOptions.validationLevel,
          max_channels: formOptions.numChannels,
          web_search_enabled: formOptions.webSearch
        }
      });

      debugContext.provider_response = {
        request_id: llmResult.request_id || null,
        provider: llmResult.provider || formOptions.provider,
        model: llmResult.model || formOptions.model,
        web_search_enabled: llmResult.web_search_enabled,
        content_preview: String(llmResult.content || '').slice(0, 1500)
      };

      const parsed = parseJsonContent(llmResult.content);
      const rawChannels = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.channels) ? parsed.channels : []);
      if (!rawChannels.length) throw new Error('No channels returned by model.');

      debugContext.parsed = {
        raw_channel_count: rawChannels.length,
        title: parsed.title || null,
        list_description_preview: String(parsed.list_description || '').slice(0, 300),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : []
      };

      const report = { invalid: [], duplicates: 0, validCount: 0 };
      const requestedModes = formOptions.selectedModes.map((mode) => normalizeMode(mode));
      const valid = rawChannels.map((item) => normalizeChannel(item, requestedModes, formOptions, report)).filter(Boolean);
      const deduped = dedupeChannels(valid, report);

      debugContext.validation = {
        pre_validation_count: rawChannels.length,
        valid_after_normalization: valid.length,
        duplicates_removed: report.duplicates,
        invalid_count: report.invalid.length,
        invalid_examples: report.invalid.slice(0, 25)
      };

      if (formOptions.validationLevel === 'strict' && report.invalid.length) {
        const strictError = new Error('Strict validation rejected one or more channels.');
        strictError.debug = { validation: debugContext.validation };
        throw strictError;
      }

      const finalChannels = formOptions.numChannels === null ? deduped : deduped.slice(0, formOptions.numChannels);
      report.validCount = finalChannels.length;
      if (!finalChannels.length) {
        const noValidError = new Error('No valid channels after validation.');
        noValidError.debug = { validation: debugContext.validation };
        throw noValidError;
      }

      const metadata = {
        title: String(parsed.title || ''),
        listDescription: String(parsed.list_description || ''),
        keywords: normalizeKeywords(parsed.keywords, formOptions)
      };

      const csvContent = buildCsv(finalChannels);
      latestCsvContent = csvContent;
      latestMeta = {
        channels: finalChannels,
        metadata: {
          location: formOptions.location,
          provider: formOptions.provider,
          model: formOptions.model,
          generated_at: new Date().toISOString(),
          count: finalChannels.length,
          title: metadata.title,
          list_description: metadata.listDescription,
          keywords: metadata.keywords
        }
      };

      renderValidation(report, formOptions);
      renderPreview(finalChannels, metadata.listDescription, metadata.keywords);
      saveLatestToSession(latestMeta, csvContent);

      const persisted = await persistGeneration(csvContent, finalChannels, formOptions, metadata);
      downloadButton.disabled = false;
      setStatus(persisted.saved ? `Generated ${finalChannels.length} channels and saved to directory.` : `Generated ${finalChannels.length} channels (saved locally only).`);
    } catch (error) {
      const errorMessage = error?.message || 'Generation failed.';
      const rule = findErrorRule(errorMessage);

      setStatus(errorMessage);
      showRecoveryAction(rule);

      debugContext.error = {
        message: errorMessage,
        status: Number(error?.status || parseStatusCode(errorMessage) || 0) || null,
        response: error?.response || null,
        matched_rule: rule ? rule.id : null,
        extra: error?.debug || null,
        completed_at: new Date().toISOString()
      };
      renderDebugDetails(debugContext);

      validationReport.textContent = 'Generation failed before validation finished.';
      previewWrap.textContent = 'No preview available.';
    } finally {
      setPending(false);
    }
  }

  function handleDownload() {
    if (!latestCsvContent) return;
    const blob = new Blob([latestCsvContent], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const locationSlug = String(latestMeta?.metadata?.location || 'frequencies').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    link.href = href;
    link.download = `chirp-${locationSlug || 'list'}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  }

  async function handleSaveAccountKey() {
    if (!window.HamKeyStore) return;
    const provider = providerInput?.value;
    const apiKey = String(apiKeyInput?.value || '').trim();
    if (!apiKey) {
      setStatus('Enter an API key first.');
      return;
    }
    try {
      await window.HamKeyStore.saveUserKey(provider, apiKey);
      setStatus('Saved API key to your account.');
    } catch (error) {
      setStatus(error?.message || 'Unable to save account key.');
    }
  }

  async function handleLoadAccountKey() {
    if (!window.HamKeyStore) return;
    const key = await window.HamKeyStore.getUserKey(providerInput?.value);
    if (!key) {
      setStatus('No account key found for this provider.');
      return;
    }
    apiKeyInput.value = key;
    await window.HamKeyStore.saveSessionKey(providerInput.value, key);
    setStatus('Loaded API key from account.');
  }

  form.addEventListener('submit', handleGenerate);
  downloadButton.addEventListener('click', handleDownload);
  providerInput?.addEventListener('change', () => {
    renderModelOptions();
    updateModelDiscoveryVisibility();
    void (async () => {
      await loadSessionKeyForProvider();
      if (String(providerInput?.value || '').toLowerCase() === 'github') {
        await handleRefreshModels({ auto: true });
      }
    })();
  });
  modelInput?.addEventListener('change', syncWebSearchAvailability);
  validationInput?.addEventListener('change', updateValidationDescription);
  templateInput?.addEventListener('change', () => applyTemplate(templateInput.value));
  rotateTemplateButton?.addEventListener('click', () => applyTemplate(templateIndex + 1));
  applyTemplateButton?.addEventListener('click', () => applyTemplate(templateInput.value));
  loadSessionKeyButton?.addEventListener('click', () => void loadSessionKeyForProvider());
  saveAccountKeyButton?.addEventListener('click', () => void handleSaveAccountKey());
  loadAccountKeyButton?.addEventListener('click', () => void handleLoadAccountKey());
  refreshModelsButton?.addEventListener('click', () => void handleRefreshModels());
  retryGenerateButton?.addEventListener('click', () => {
    if (!generateButton.disabled) {
      form.requestSubmit();
    }
  });
  retryNextModelButton?.addEventListener('click', () => {
    const secondaryAction = lastMatchedErrorRule?.secondary_action || null;
    if (secondaryAction?.type !== 'next_model') {
      return;
    }

    const changed = selectNextModel();
    if (!changed) {
      setStatus('No alternative model is available in this provider list.');
      return;
    }

    setStatus(`Switched to model ${modelInput.value}. Retrying…`);
    if (!generateButton.disabled) {
      form.requestSubmit();
    }
  });

  apiKeyInput?.addEventListener('input', () => {
    const value = String(apiKeyInput.value || '').trim();
    if (!value || !window.HamKeyStore || !providerInput) return;
    void window.HamKeyStore.saveSessionKey(providerInput.value, value);
  });

  (async function init() {
    await loadOptionsConfig();
    await loadErrorHandlingConfig();
    await detectLocation();
    renderModelOptions();
    updateModelDiscoveryVisibility();
    renderTemplateOptions();
    applyTemplate(0);
    updateValidationDescription();
    restoreLatestFromSession();
    await loadSessionKeyForProvider();
  })();
})();
