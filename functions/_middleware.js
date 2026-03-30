export async function onRequest(context) {
  const { request, next, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/llm') && env.RATE_LIMITS) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const bucketKey = `ratelimit:${ip}:${Math.floor(Date.now() / 60000)}`;

    try {
      const currentRaw = await env.RATE_LIMITS.get(bucketKey);
      const current = Number(currentRaw || 0);
      if (current >= 10) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit reached. Please wait and try again.'
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          }
        );
      }

      await env.RATE_LIMITS.put(bucketKey, String(current + 1), { expirationTtl: 120 });
    } catch (_error) {
      // no-op: fail-open if KV is unavailable
    }
  }

  const response = await next();
  const wrapped = new Response(response.body, response);
  Object.entries(corsHeaders).forEach(([key, value]) => wrapped.headers.set(key, value));
  return wrapped;
}
