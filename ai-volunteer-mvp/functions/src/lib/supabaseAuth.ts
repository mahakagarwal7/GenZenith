import { createHmac, timingSafeEqual } from 'crypto';
import { supabase } from './supabaseClient';
import type { HttpRequest, HttpResponse } from './httpTypes';

type JwtPayload = {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  nbf?: number;
  app_metadata?: {
    role?: string;
  };
  [key: string]: unknown;
};

export type AuthenticatedUser = {
  id: string;
  email?: string;
  role?: string;
  claims: JwtPayload;
};

export type AuthenticatedRequest = HttpRequest & {
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
};

export type AuthenticatedHandler = (
  req: AuthenticatedRequest,
  res: HttpResponse
) => Promise<void> | void;

function getHeader(req: AuthenticatedRequest, name: string): string | undefined {
  const headers = req.headers;
  if (!headers) {
    return undefined;
  }

  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function extractBearerToken(req: AuthenticatedRequest): string | null {
  const authorization = getHeader(req, 'authorization');
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  return Buffer.from(padded, 'base64');
}

function resolveRole(payload: JwtPayload): string | undefined {
  if (typeof payload.role === 'string' && payload.role.trim()) {
    return payload.role;
  }

  if (typeof payload.app_metadata?.role === 'string' && payload.app_metadata.role.trim()) {
    return payload.app_metadata.role;
  }

  return undefined;
}

async function resolveProfileRole(userId: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<{ role: string }>();

  if (error || !data?.role) {
    return undefined;
  }

  return data.role;
}

function verifySignature(token: string, secret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac('sha256', secret).update(signingInput).digest();
  const actual = base64UrlDecode(encodedSignature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('Invalid JWT signature');
  }

  const payloadJson = base64UrlDecode(encodedPayload).toString('utf8');
  const payload = JSON.parse(payloadJson) as JwtPayload;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now >= payload.exp) {
    throw new Error('JWT expired');
  }

  if (typeof payload.nbf === 'number' && now < payload.nbf) {
    throw new Error('JWT not active');
  }

  return payload;
}

export async function verifyJwtFromRequestHeaders(req: AuthenticatedRequest): Promise<AuthenticatedUser> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new Error('Missing bearer token');
  }

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('Missing SUPABASE_JWT_SECRET');
  }

  const payload = verifySignature(token, jwtSecret);
  if (!payload.sub) {
    throw new Error('JWT missing subject');
  }

  let role = resolveRole(payload);
  if (!role) {
    role = await resolveProfileRole(payload.sub);
  }

  return {
    id: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    role,
    claims: payload
  };
}

export function withAuth(handler: AuthenticatedHandler) {
  return async (req: HttpRequest, res: HttpResponse): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = await verifyJwtFromRequestHeaders(authReq);
      authReq.user = user;
      await handler(authReq, res);
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

export function hasRole(user: AuthenticatedUser | undefined, roles: string[]): boolean {
  if (!user?.role) {
    return false;
  }

  return roles.includes(user.role);
}

/*
Usage notes:
- Supabase Auth is powered by GoTrue. It is conceptually similar to Firebase Auth flows,
  but it is a different implementation and token issuer.
- Anonymous vs authenticated flows:
  1) Public webhook routes (example: Twilio callbacks) can skip withAuth and validate signatures instead.
  2) User routes should use withAuth and then role checks via hasRole(req.user, [...]).
- Local testing:
  Use `supabase auth token` to mint a local token and send it in Authorization:
  Authorization: Bearer <token>

Example endpoint guard strategy:
// Only allow Twilio webhook (no auth) OR authenticated coordinators
// For volunteer endpoints: require auth + role = 'volunteer'
*/