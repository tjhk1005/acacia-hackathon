/** Runtime-only service proxy. Never read the binding at build time. */
export async function proxyPlanningRequest(request: Request): Promise<Response> {
  const base = process.env.BACKEND_URL || (!process.env.VERCEL ? process.env.PLANNING_API_URL || 'http://127.0.0.1:8000' : undefined);
  if (!base) return Response.json({ detail: 'The backend service binding is unavailable.' }, { status: 503 });
  const incoming = new URL(request.url);
  const path = incoming.pathname.replace(/^\/planning-api\//, '').replace(/^\//, '');
  if (path !== 'health' && path !== 'api/weddings' && !path.startsWith('api/weddings/') && !['webhooks/whatsapp', 'webhooks/twilio/whatsapp', 'webhooks/twilio/status'].includes(path)) {
    return Response.json({ detail: 'Unknown planning endpoint.' }, { status: 404 });
  }
  const headers = new Headers();
  for (const name of ['content-type', 'x-wedding-token', 'x-hub-signature-256', 'x-twilio-signature']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const destination = new URL(base.replace(/\/$/, '') + '/' + path);
    destination.search = incoming.search;
    const upstream = await fetch(destination, {
      method: request.method, headers,
      ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: await request.arrayBuffer() }),
      cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(40000),
    });
    if (upstream.status === 404) {
      const error = await upstream.clone().json().catch(() => null);
      if (!error || error.detail === 'Not Found') {
        return Response.json({ detail: { code: 'backend_route_not_found', message: 'The backend service route is not configured correctly.' } }, { status: 502 });
      }
    }
    // Do not pass internal redirect locations, cookies or hop-by-hop headers to browsers.
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    const contentType = upstream.headers.get('content-type');
    if (contentType) responseHeaders.set('content-type', contentType);
    if (upstream.status >= 300 && upstream.status < 400) {
      return Response.json({ detail: 'Unexpected backend redirect.' }, { status: 502 });
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return Response.json({ detail: timeout ? 'The backend request timed out.' : 'The backend service is unavailable.' }, { status: timeout ? 504 : 502 });
  }
}
