const MAX_PROMPT_LENGTH = 12000;
const MAX_RESPONSE_TEXT_LENGTH = 500000;

const PROVIDER_CONFIGS = {
  openai: {
    defaultModel: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    buildHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`
    }),
    buildBody: (model, prompt) => ({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    }),
    extractText: (payload) => payload?.choices?.[0]?.message?.content || ''
  },
  gemini: {
    defaultModel: 'gemini-2.0-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    buildUrl: (model, apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    buildHeaders: () => ({}),
    buildBody: (_model, prompt, webSearchEnabled) => {
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3
        }
      };

      if (webSearchEnabled) {
        payload.tools = [{ google_search: {} }];
      }

      return payload;
    },
    extractText: (payload) => payload?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  },
  claude: {
    defaultModel: 'claude-sonnet-4-20250514',
    endpoint: 'https://api.anthropic.com/v1/messages',
    buildHeaders: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }),
    buildBody: (model, prompt) => ({
      model,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    }),
    extractText: (payload) => payload?.content?.[0]?.text || ''
  },
  grok: {
    defaultModel: 'grok-3-mini',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    buildHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`
    }),
    buildBody: (model, prompt) => ({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    }),
    extractText: (payload) => payload?.choices?.[0]?.message?.content || ''
  },
  github: {
    defaultModel: 'gpt-4.1-mini',
    endpoint: 'https://models.inference.ai.azure.com/chat/completions',
    buildHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`
    }),
    buildBody: (model, prompt) => ({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    }),
    extractText: (payload) => payload?.choices?.[0]?.message?.content || ''
  }
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

function makeRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseBodySafely(request) {
  return request.json().catch(() => null);
}

function sanitizePrompt(prompt) {
  return String(prompt || '')
    .replace(/[\u0000-\u001F]+/g, ' ')
    .trim();
}

function normalizeGithubModelId(rawModel) {
  const raw = String(rawModel || '').trim();
  if (!raw) {
    return raw;
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

function redactErrorBody(errorBody) {
  const text = String(errorBody || '');
  if (text.length <= 800) {
    return text;
  }
  return `${text.slice(0, 800)}…`;
}

function safeLog(event, metadata) {
  console.log(
    JSON.stringify({
      event,
      ...metadata
    })
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function callProvider(endpoint, headers, body) {
  return fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

export async function onRequestPost(context) {
  const requestId = makeRequestId();
  const startedAt = Date.now();
  const body = await parseBodySafely(context.request);

  if (!body) {
    return jsonResponse({ error: 'Invalid JSON body', request_id: requestId }, 400);
  }

  const provider = String(body.provider || '').trim().toLowerCase();
  const apiKey = String(body.api_key || '').trim();
  const prompt = sanitizePrompt(body.prompt || '');

  if (!provider || !apiKey || !prompt) {
    return jsonResponse({ error: 'Missing required fields: provider, api_key, prompt', request_id: requestId }, 400);
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return jsonResponse({ error: `Prompt too large. Max length is ${MAX_PROMPT_LENGTH} chars.`, request_id: requestId }, 413);
  }

  const providerConfig = PROVIDER_CONFIGS[provider];
  if (!providerConfig) {
    return jsonResponse({ error: `Unknown provider: ${provider}`, request_id: requestId }, 400);
  }

  const requestedModel = String(body.model || providerConfig.defaultModel).trim() || providerConfig.defaultModel;
  const model = provider === 'github' ? normalizeGithubModelId(requestedModel) : requestedModel;
  const webSearchEnabled = body.web_search === false ? false : true;
  const metadata = body.request_meta && typeof body.request_meta === 'object' ? body.request_meta : {};

  safeLog('generation_started', {
    request_id: requestId,
    provider,
    model,
    prompt_chars: prompt.length,
    validation_level: metadata.validation_level || 'unknown',
    channel_target: metadata.num_channels || metadata.max_channels || null,
    web_search_enabled: webSearchEnabled
  });

  let endpoint = providerConfig.endpoint;
  if (typeof providerConfig.buildUrl === 'function') {
    endpoint = providerConfig.buildUrl(model, apiKey);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...providerConfig.buildHeaders(apiKey)
  };

  const requestBody = providerConfig.buildBody(model, prompt, webSearchEnabled);

  try {
    let providerResponse = await callProvider(endpoint, headers, requestBody);

    if (!providerResponse.ok && provider === 'gemini' && providerResponse.status === 429) {
      safeLog('provider_retry', {
        request_id: requestId,
        provider,
        model,
        reason: 'gemini_429_retry_once'
      });

      await sleep(900);
      providerResponse = await callProvider(endpoint, headers, requestBody);
    }

    if (!providerResponse.ok && provider === 'gemini' && providerResponse.status === 400 && webSearchEnabled) {
      safeLog('provider_retry', {
        request_id: requestId,
        provider,
        model,
        reason: 'gemini_400_with_web_search_retry_without_search'
      });

      const fallbackBody = providerConfig.buildBody(model, prompt, false);
      providerResponse = await callProvider(endpoint, headers, fallbackBody);
    }

    if (!providerResponse.ok) {
      const providerErrorText = await providerResponse.text();
      const retryAfter = providerResponse.headers.get('retry-after');
      const isRateLimit = providerResponse.status === 429;
      safeLog('generation_failed', {
        request_id: requestId,
        provider,
        status: providerResponse.status,
        duration_ms: Date.now() - startedAt
      });
      return jsonResponse(
        {
          error: isRateLimit
            ? `LLM provider rate-limited request (${providerResponse.status}).`
            : `LLM provider returned ${providerResponse.status}`,
          details: redactErrorBody(providerErrorText),
          retry_after_seconds: retryAfter ? Number(retryAfter) || null : null,
          request_id: requestId
        },
        providerResponse.status
      );
    }

    const providerPayload = await providerResponse.json();
    const content = providerConfig.extractText(providerPayload);

    if (!content) {
      safeLog('generation_failed', {
        request_id: requestId,
        provider,
        status: 502,
        duration_ms: Date.now() - startedAt
      });
      return jsonResponse({ error: 'Provider returned an empty response.', request_id: requestId }, 502);
    }

    if (content.length > MAX_RESPONSE_TEXT_LENGTH) {
      safeLog('generation_failed', {
        request_id: requestId,
        provider,
        status: 413,
        duration_ms: Date.now() - startedAt
      });
      return jsonResponse({ error: 'Provider response too large.', request_id: requestId }, 413);
    }

    safeLog('provider_called', {
      request_id: requestId,
      provider,
      model,
      web_search_enabled: webSearchEnabled,
      duration_ms: Date.now() - startedAt,
      response_chars: content.length
    });

    return jsonResponse({
      ok: true,
      provider,
      model,
      web_search_enabled: webSearchEnabled,
      content,
      request_id: requestId
    });
  } catch (error) {
    safeLog('generation_failed', {
      request_id: requestId,
      provider,
      status: 500,
      duration_ms: Date.now() - startedAt,
      reason: 'network_or_internal_error'
    });

    return jsonResponse(
      {
        error: 'Internal server error while calling provider.',
        request_id: requestId
      },
      500
    );
  }
}
