import { supabase } from '../_shared/supabase.ts';
import { jsonResponse, methodNotAllowed, parseJsonBody } from '../_shared/http.ts';

const DEFAULT_NGO_ID = Deno.env.get('DEFAULT_NGO_ID');
const NEED_EVIDENCE_BUCKET = Deno.env.get('SUPABASE_NEED_EVIDENCE_BUCKET');

type TwilioConfig = {
  sid: string;
  token: string;
  from: string;
};

function getTwilioConfig(): TwilioConfig | null {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') || Deno.env.get('TWILIO_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || Deno.env.get('TWILIO_PHONE_NUMBER') || Deno.env.get('TWILIO_FROM_NUMBER');
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

async function sendTwilioMessage(to: string, body: string): Promise<void> {
  const config = getTwilioConfig();
  if (!config) {
    console.warn('Twilio config missing; skipping requester notification.');
    return;
  }

  const auth = btoa(`${config.sid}:${config.token}`);
  const payload = new URLSearchParams({
    To: to,
    From: config.from,
    Body: body,
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  });

  if (!response.ok) {
    console.error('Twilio requester notification failed:', response.status, await response.text());
  }
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  medical: ['blood', 'doctor', 'hospital', 'medicine', 'injury', 'accident', 'bleeding'],
  water_supply: ['water', 'tanker', 'dry', 'dehydration', 'well', 'pipeline'],
  logistics: ['transport', 'road', 'blocked', 'delivery', 'supplies', 'vehicle'],
  food: ['food', 'ration', 'hunger', 'meal', 'grain', 'kitchen'],
};

function extractLocationText(rawText: string): string {
  const normalizedText = rawText.replace(/\s+/g, ' ').trim();
  const match = normalizedText.match(/(?:\b(?:at|in|near|around)\b|\blocation\b[:\-]?)\s+([^.;\n]+)/i);

  if (match?.[1]) {
    return match[1].trim();
  }

  return normalizedText;
}

function classifyMessage(text: string): { category: string; classification: 'critical' | 'urgent' | 'normal' | 'low' } {
  const lower = text.toLowerCase();
  const isCritical = /\b(emergency|critical|immediately|life|bleeding)\b/i.test(lower);
  const category = Object.entries(CATEGORY_KEYWORDS).find(([, k]) => k.some((w) => lower.includes(w)))?.[0] || 'general';

  if (isCritical) return { category, classification: 'critical' };
  if (/\b(urgent|asap|today|soon)\b/i.test(lower)) return { category, classification: 'urgent' };
  if (/\b(next week|flexible|update|status)\b/i.test(lower)) return { category, classification: 'low' };
  return { category, classification: 'normal' };
}

// ---------------------------------------------------------------------------
// Google Cloud Vision — Service Account JWT Auth (preferred)
// Falls back to API key if GOOGLE_SERVICE_ACCOUNT_JSON is not set.
// ---------------------------------------------------------------------------

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function base64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);
  // Convert to base64
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getGoogleAccessToken(): Promise<string | null> {
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

    // Import RSA private key from PKCS#8 PEM
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

    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const jwt = `${signingInput}.${sig}`;

    // Exchange JWT for OAuth2 access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenRes.ok) {
      console.error('Google token exchange failed:', await tokenRes.text());
      return null;
    }

    const tokenData = await tokenRes.json() as { access_token?: string };
    return tokenData.access_token ?? null;
  } catch (err) {
    console.error('getGoogleAccessToken error:', err);
    return null;
  }
}

async function geocodeLocation(text: string): Promise<{ lat: number; lng: number } | null> {
  if (!text.trim()) {
    return null;
  }

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_MAPS_APIKEY') || Deno.env.get('GOOGLE_MAPS_KEY');
  if (!apiKey) {
    return null;
  }

  const endpoint = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const location = payload?.results?.[0]?.geometry?.location;
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return null;
  }

  return { lat: location.lat, lng: location.lng };
}

async function extractTextFromImage(imageUri: string): Promise<{ text: string; confidence: number }> {
  if (!imageUri) {
    return { text: '', confidence: 0 };
  }

  // 1. Try service account auth (preferred — more secure, no API key needed)
  const accessToken = await getGoogleAccessToken();

  // 2. Fall back to API key if service account not configured
  const apiKey = accessToken
    ? null
    : (Deno.env.get('GOOGLE_VISION_API_KEY') || Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY'));

  if (!accessToken && !apiKey) {
    console.warn('Google Vision: no credentials configured (set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLOUD_VISION_API_KEY)');
    return { text: '', confidence: 0 };
  }

  const endpoint = accessToken
    ? 'https://vision.googleapis.com/v1/images:annotate'
    : `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey!)}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: [
        {
          image: { source: { imageUri } },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error('Google Vision API error:', response.status, await response.text());
    return { text: '', confidence: 0 };
  }

  const payload = await response.json();
  const fullTextAnnotation = payload?.responses?.[0]?.fullTextAnnotation;
  const text = typeof fullTextAnnotation?.text === 'string' ? fullTextAnnotation.text.trim() : '';
  const confidence = Number(fullTextAnnotation?.pages?.[0]?.confidence ?? 0);
  return { text, confidence: Math.round(confidence * 100) / 100 };
}

function toPostgisPoint(geo: { lat: number; lng: number } | null): string | null {
  if (!geo) {
    return null;
  }

  return `SRID=4326;POINT(${geo.lng} ${geo.lat})`;
}

async function uploadNeedImage(needId: string, fileBuffer: Uint8Array, contentType: string): Promise<string> {
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error('Only image uploads are allowed');
  }

  if (!NEED_EVIDENCE_BUCKET) {
    throw new Error('Missing SUPABASE_NEED_EVIDENCE_BUCKET configuration');
  }

  if (fileBuffer.byteLength > 10 * 1024 * 1024) {
    throw new Error('Image exceeds 10MB limit');
  }

  const path = `${needId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(NEED_EVIDENCE_BUCKET).upload(path, fileBuffer, {
    contentType,
    upsert: false,
    cacheControl: '3600',
  });

  if (error) {
    throw error;
  }

  const signed = await supabase.storage.from(NEED_EVIDENCE_BUCKET).createSignedUrl(path, 24 * 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    throw signed.error || new Error('Failed to create signed URL');
  }

  return signed.data.signedUrl;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return methodNotAllowed();
  }

  const contentType = req.headers.get('content-type') ?? '';
  let body: Record<string, unknown> = {};

  const isTwilioForm = contentType.includes('application/x-www-form-urlencoded');
  if (isTwilioForm) {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    for (const [key, value] of params.entries()) {
      body[key] = value;
    }
  } else {
    body = await parseJsonBody(req);
  }

  const incomingText = typeof body.Body === 'string' ? body.Body : '';
  const mediaUrl = typeof body.MediaUrl0 === 'string' ? body.MediaUrl0 : '';
  const from = typeof body.From === 'string' ? body.From : null;

  if (!incomingText && !mediaUrl) {
    if (isTwilioForm) {
      return new Response('<Response><Message>Missing message content.</Message></Response>', {
        status: 400,
        headers: { 'Content-Type': 'text/xml' },
      });
    }
    return jsonResponse({ error: 'Missing payload' }, 400);
  }

  try {
    if (!DEFAULT_NGO_ID) {
      if (isTwilioForm) {
        return new Response('<Response><Message>Service not configured.</Message></Response>', {
          status: 500,
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      return jsonResponse({ error: 'Missing DEFAULT_NGO_ID configuration' }, 500);
    }

    const needId = crypto.randomUUID();
    let rawText = incomingText;
    let confidence = 1;

    if (mediaUrl) {
      let ocrSource = mediaUrl;

      if (/^https?:\/\//i.test(mediaUrl)) {
        try {
          const mediaResponse = await fetch(mediaUrl);
          if (mediaResponse.ok) {
            const buffer = new Uint8Array(await mediaResponse.arrayBuffer());
            const contentType = mediaResponse.headers.get('content-type') || 'image/jpeg';
            ocrSource = await uploadNeedImage(needId, buffer, contentType);
          }
        } catch {
          // Keep source URL fallback when storage upload fails.
        }
      }

      const ocr = await extractTextFromImage(ocrSource);
      rawText = ocr.text;
      confidence = ocr.confidence;
    }

    const classification = classifyMessage(rawText);
    const locationText = extractLocationText(rawText);
    const geo = await geocodeLocation(locationText);
    const status = !geo || confidence < 0.7 ? 'needs_validation' : 'unassigned';

    const { data, error } = await supabase
      .from('needs')
      .insert({
        need_id: needId,
        source: 'whatsapp',
        submitted_at: new Date().toISOString(),
        location_geo: toPostgisPoint(geo),
        location_text: locationText,
        category: classification.category,
        subcategory: 'pending',
        urgency: classification.classification,
        raw_text: rawText,
        confidence,
        status,
        assigned_to: null,
        ngo_id: DEFAULT_NGO_ID,
        contact_number: from,
      })
      .select('need_id')
      .single();

    if (error) {
      throw error;
    }

    const responseNeedId = data?.need_id || needId;
    if (from) {
      await sendTwilioMessage(
        from,
        `Request received. Your Need ID is ${responseNeedId}. We are matching a volunteer now. Reply YES to receive the assigned volunteer details.`,
      );
    }

    if (isTwilioForm) {
      return new Response(
        `<Response><Message>Request received. Your Need ID is ${responseNeedId}. We are matching a volunteer now. Reply YES to receive the assigned volunteer details.</Message></Response>`,
        { status: 200, headers: { 'Content-Type': 'text/xml' } },
      );
    }

    return jsonResponse({ status: 'ok', needId: responseNeedId }, 200);
  } catch (error) {
    console.error('whatsapp-webhook failed:', error);
    if (isTwilioForm) {
      return new Response('<Response><Message>Sorry, we could not process your request.</Message></Response>', {
        status: 500,
        headers: { 'Content-Type': 'text/xml' },
      });
    }
    return jsonResponse({ error: 'Pipeline failed' }, 500);
  }
});
