export async function onRequestGet(context) {
  const { request } = context;
  const cf = request.cf || {};

  return new Response(
    JSON.stringify({
      country: cf.country || 'Unknown',
      region: cf.region || 'Unknown',
      city: cf.city || 'Unknown',
      timezone: cf.timezone || 'UTC'
    }),
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}
