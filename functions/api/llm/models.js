function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

function parseBodySafely(request) {
  return request.json().catch(() => null);
}

function normalizeGithubModelId(rawId) {
  const raw = String(rawId || '').trim();
  if (!raw) {
    return '';
  }

  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch (_error) {
      return raw;
    }
  })();

  const azureRegistryMatch = decoded.match(/\/models\/([^/]+)\/versions\//i);
  if (azureRegistryMatch?.[1]) {
    return azureRegistryMatch[1];
  }

  const providerPrefixedMatch = decoded.match(/^(openai|meta|mistral|cohere|anthropic|xai)\/([A-Za-z0-9._-]+)$/i);
  if (providerPrefixedMatch?.[2]) {
    return providerPrefixedMatch[2];
  }

  return decoded;
}

function normalizeGithubModel(item) {
  const sourceId = String(item?.id || item?.name || '').trim();
  const id = normalizeGithubModelId(sourceId);
  if (!id) {
    return null;
  }

  const tools = [
    ...(Array.isArray(item?.tools) ? item.tools : []),
    ...(Array.isArray(item?.capabilities?.tools) ? item.capabilities.tools : []),
    ...(Array.isArray(item?.features?.tools) ? item.features.tools : [])
  ]
    .map((tool) => {
      if (typeof tool === 'string') return tool.toLowerCase();
      return String(tool?.name || '').toLowerCase();
    })
    .filter(Boolean);

  const booleanSignals = [
    item?.web_search_available,
    item?.capabilities?.web_search,
    item?.capabilities?.grounding,
    item?.capabilities?.browser,
    item?.features?.web_search,
    item?.features?.grounding
  ];

  const webSearchAvailable =
    booleanSignals.some((flag) => flag === true) ||
    tools.some((toolName) => /(search|ground|browser)/.test(toolName));

  return {
    id,
    label: String(item?.label || id),
    web_search_available: webSearchAvailable
  };
}

async function fetchGithubModels(apiKey) {
  const response = await fetch('https://models.inference.ai.azure.com/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  });

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      details: text
    };
  }

  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (_error) {
    payload = null;
  }

  const rawItems = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.models) ? payload.models : []));

  const models = rawItems
    .map((item) => normalizeGithubModel(item))
    .filter(Boolean);

  return {
    ok: true,
    status: 200,
    models
  };
}

export async function onRequestPost(context) {
  const body = await parseBodySafely(context.request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const provider = String(body.provider || '').trim().toLowerCase();
  const apiKey = String(body.api_key || '').trim();

  if (!provider || !apiKey) {
    return jsonResponse({ error: 'Missing required fields: provider, api_key' }, 400);
  }

  if (provider !== 'github') {
    return jsonResponse({
      error: `Model discovery is not implemented for provider: ${provider}`
    }, 501);
  }

  const result = await fetchGithubModels(apiKey);
  if (!result.ok) {
    const status = Number(result.status || 500);
    const retryable = status === 429 || status >= 500;
    let message = `Provider model list request failed (${status})`;
    if (status === 401 || status === 403) {
      message = 'GitHub model discovery authorization failed. Check token permissions for GitHub Models.';
    } else if (status === 429) {
      message = 'GitHub model discovery was rate-limited. Please retry in a moment.';
    }

    return jsonResponse({
      error: message,
      details: String(result.details || '').slice(0, 800),
      retryable
    }, status);
  }

  return jsonResponse({
    ok: true,
    provider,
    models: result.models
  });
}
