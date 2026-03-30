export function onRequest({ request }) {
  const destination = new URL('/radios/', request.url);
  return Response.redirect(destination.toString(), 301);
}
