export function getCorsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    // Do not expose credentials by default; set to 'true' only if you rely on cookies
    'Access-Control-Allow-Credentials': 'false',
  } as Record<string, string>;
}

export function jsonResponse(body: unknown, status = 200, origin = '*'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    },
  });
}

export async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function methodNotAllowed(): Response {
  return new Response('Method Not Allowed', { status: 405, headers: getCorsHeaders() });
}
