export function healthRoute(): Response {
  return Response.json({ ok: true, at: new Date().toISOString() });
}
