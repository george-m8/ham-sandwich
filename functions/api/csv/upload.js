export async function onRequestPost() {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Not implemented on Worker route. CSV upload is handled client-side via Firebase Storage.'
    }),
    {
      status: 501,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}
