export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      ok: true,
      items: [],
      message: 'CSV directory is loaded client-side from Firebase Firestore.'
    }),
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}
