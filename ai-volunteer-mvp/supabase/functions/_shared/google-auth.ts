/**
 * Shared utility for Google Service Account Authentication
 */

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function base64url(data: ArrayBuffer | string): string {
  const base64 = typeof data === 'string' ? btoa(data) : btoa(String.fromCharCode(...new Uint8Array(data)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function getGoogleAccessToken(): Promise<string | null> {
  const jsonStr = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!jsonStr || !jsonStr.trim()) return null;

  try {
    const sa = JSON.parse(jsonStr) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) return null;

    const now = Math.floor(Date.now() / 1000);

    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }));

    const signingInput = `${header}.${payload}`;

    const pemBody = sa.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\n/g, '')
      .trim();

    const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const sigBytes = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signingInput),
    );

    const sig = base64url(sigBytes);
    const jwt = `${signingInput}.${sig}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      console.error('Failed to get Google Access Token:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (err) {
    console.error('Error authenticating with Google Service Account:', err);
    return null;
  }
}
