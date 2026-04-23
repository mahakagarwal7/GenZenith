import { supabase } from '../_shared/supabase.ts';
import { jsonResponse, methodNotAllowed, parseJsonBody } from '../_shared/http.ts';

type NeedRow = {
  need_id: string;
  category: string;
  location_geo: unknown | null;
  status: string;
};

type CandidateVolunteerRow = {
  id: string;
  location: unknown | null;
  skills: string[];
  historical_response_rate: number;
  typical_capacity: number;
  total_assignments: number;
  active_tasks: number;
  contact_number: string | null;
};
type VolunteerInfo = {
  id: string;
  full_name: string | null;
  city: string | null;
  contact_number: string | null;
  skills: string[];
};

type TwilioConfig = {
  sid: string;
  token: string;
  from: string;
};

function parsePoint(value: unknown): { lat: number; lng: number } | null {
  if (!value) return null;

  if (typeof value === 'object' && value !== null) {
    const point = value as Record<string, unknown>;
    if (typeof point.lat === 'number' && typeof point.lng === 'number') {
      return { lat: point.lat, lng: point.lng };
    }
  }

  if (typeof value === 'string') {
    const match = value.match(/POINT\(([-0-9.]+)\s+([-0-9.]+)\)/i);
    if (match) {
      const lng = Number(match[1]);
      const lat = Number(match[2]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { lat, lng };
      }
    }

    if (/^[0-9a-fA-F]+$/.test(value) && value.length >= 42) {
      try {
        const bytes = new Uint8Array(value.length / 2);
        for (let i = 0; i < value.length; i += 2) {
          bytes[i / 2] = Number.parseInt(value.slice(i, i + 2), 16);
        }

        const view = new DataView(bytes.buffer);
        const littleEndian = view.getUint8(0) === 1;
        const geomType = view.getUint32(1, littleEndian);
        const hasSrid = (geomType & 0x20000000) !== 0;
        const baseType = geomType & 0x000000ff;

        if (baseType === 1) {
          let offset = 5;
          if (hasSrid) {
            offset += 4;
          }

          const lng = view.getFloat64(offset, littleEndian);
          const lat = view.getFloat64(offset + 8, littleEndian);

          if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            return { lat, lng };
          }
        }
      } catch {
        // Ignore invalid EWKB payloads and fall through to null.
      }
    }
  }

  return null;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

function toPostgisPoint(geo: { lat: number; lng: number } | null): string | null {
  if (!geo) {
    return null;
  }

  return `SRID=4326;POINT(${geo.lng} ${geo.lat})`;
}

async function loadNeed(needId: string): Promise<NeedRow | null> {
  const { data, error } = await supabase
    .from('needs')
    .select('need_id, category, location_geo, status')
    .eq('need_id', needId)
    .maybeSingle<NeedRow>();

  if (error) throw error;
  return data ?? null;
}

async function insertMatchLog(needId: string, volunteerId: string | null): Promise<void> {
  const { error } = await supabase
    .from('match_logs')
    .insert({
      need_id: needId,
      volunteer_id: volunteerId,
      match_score: null,
      timestamp: new Date().toISOString(),
      metadata: { source: 'volunteer-response' },
    });

  if (error) throw error;
}

async function matchVolunteers(needId: string, excludedVolunteerIds: string[]): Promise<string[]> {
  const need = await loadNeed(needId);
  if (!need) return [];

  const needGeo = parsePoint(need.location_geo);
  if (!needGeo) return [];

  const rpc = await supabase.rpc('match_volunteers_for_need', {
    p_lat: needGeo.lat,
    p_lng: needGeo.lng,
    p_radius_meters: 10000,
    p_category: need.category,
    p_limit: 100,
  });

  if (rpc.error) throw rpc.error;

  const excluded = new Set(excludedVolunteerIds);
  const candidates = (rpc.data ?? []) as CandidateVolunteerRow[];

  const ranked = candidates
    .filter((candidate) => !excluded.has(candidate.id))
    .map((candidate) => {
      const volunteerGeo = parsePoint(candidate.location) || needGeo;
      const distance = haversine(needGeo.lat, needGeo.lng, volunteerGeo.lat, volunteerGeo.lng);
      const proximity = Math.max(0, 1 - distance / 10);
      const skill = candidate.skills.includes(need.category) ? 1 : 0.3;
      const availability = candidate.historical_response_rate;
      const workload = 1 - Math.min(1, candidate.active_tasks / Math.max(candidate.typical_capacity, 1));
      const fairness = 1 - Math.min(1, candidate.total_assignments / 50);
      const score = 0.25 * proximity + 0.25 * skill + 0.2 * availability + 0.15 * workload + 0.15 * fairness;
      return { id: candidate.id, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return ranked.map((item) => item.id);
}

async function notifyVolunteer(volunteerId: string, needId: string): Promise<boolean> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') || Deno.env.get('TWILIO_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_PHONE_NUMBER') || Deno.env.get('TWILIO_FROM_NUMBER');

  if (!sid || !token || !from) {
    return false;
  }

  const volunteer = await supabase
    .from('volunteers')
    .select('contact_number')
    .eq('id', volunteerId)
    .maybeSingle<{ contact_number: string | null }>();

  if (volunteer.error || !volunteer.data?.contact_number) {
    return false;
  }

  const isWhatsApp = volunteer.data.contact_number.startsWith('whatsapp:');
  const whatsappFrom = Deno.env.get('TWILIO_WHATSAPP_NUMBER');
  const fromStr = isWhatsApp ? whatsappFrom : from;

  if (isWhatsApp && !fromStr) {
    return false;
  }

  const body = new URLSearchParams({
    To: volunteer.data.contact_number,
    From: fromStr,
    Body: `New need assigned: ${needId}. Reply YES to accept or NO to decline.`,
  });

  const basicAuth = btoa(`${sid}:${token}`);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  return response.ok;
}

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
    console.warn('Twilio config missing; skipping message send.');
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
    console.error('Twilio message failed:', response.status, await response.text());
  }
}

async function loadVolunteerInfo(volunteerId: string): Promise<VolunteerInfo | null> {
  const { data, error } = await supabase
    .from('volunteers')
    .select('id, full_name, city, contact_number, skills')
    .eq('id', volunteerId)
    .maybeSingle<VolunteerInfo>();

  if (error) throw error;
  return data ?? null;
}

function formatVolunteerSummary(volunteer: VolunteerInfo): string {
  const name = volunteer.full_name || 'Volunteer';
  const city = volunteer.city ? `, ${volunteer.city}` : '';
  const skills = volunteer.skills?.length ? volunteer.skills.join(', ') : 'N/A';
  const phone = volunteer.contact_number || 'N/A';
  return `${name}${city}\nID: ${volunteer.id}\nPhone: ${phone}\nSkills: ${skills}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return methodNotAllowed();
  }

  const contentType = req.headers.get('content-type') ?? '';
  let payload: Record<string, unknown> = {};

  const isTwilioForm = contentType.includes('application/x-www-form-urlencoded');
  if (isTwilioForm) {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    for (const [key, value] of params.entries()) {
      payload[key] = value;
    }
  } else {
    payload = await parseJsonBody(req);
  }

  let needId = typeof payload.needId === 'string' ? payload.needId : '';
  let volunteerId = typeof payload.volunteerId === 'string' ? payload.volunteerId : '';
  let response = typeof payload.response === 'string' ? payload.response : '';

  if (!needId && !volunteerId && typeof payload.Body === 'string' && typeof payload.From === 'string') {
    response = payload.Body;
    const from = payload.From;

    const volunteer = await supabase
      .from('volunteers')
      .select('id')
      .eq('contact_number', from)
      .maybeSingle<{ id: string }>();

    if (volunteer.error) {
      console.error('Failed to lookup volunteer from Twilio From:', volunteer.error);
      return jsonResponse({ error: 'Failed to lookup volunteer' }, 500);
    }

    volunteerId = volunteer.data?.id ?? '';

    if (volunteerId) {
      const match = await supabase
        .from('match_logs')
        .select('need_id')
        .eq('volunteer_id', volunteerId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle<{ need_id: string }>();

      if (match.error) {
        console.error('Failed to lookup need for volunteer:', match.error);
        return jsonResponse({ error: 'Failed to lookup need' }, 500);
      }

      needId = match.data?.need_id ?? '';
    }
  }

  response = response.trim().toUpperCase();

  if (isTwilioForm && (response !== 'YES' && response !== 'NO')) {
    const rawText = typeof payload.Body === 'string' ? payload.Body.trim() : '';
    const from = typeof payload.From === 'string' ? payload.From : '';

    if (!rawText || !from) {
      return new Response('<Response><Message>Missing message content.</Message></Response>', {
        status: 400,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const classification = classifyMessage(rawText);
    const locationText = extractLocationText(rawText);
    const geo = await geocodeLocation(locationText);
    const status = !geo ? 'needs_validation' : 'unassigned';
    const needIdNew = crypto.randomUUID();

    const { error } = await supabase
      .from('needs')
      .insert({
        need_id: needIdNew,
        source: 'whatsapp',
        submitted_at: new Date().toISOString(),
        location_geo: toPostgisPoint(geo),
        location_text: locationText,
        category: classification.category,
        subcategory: 'pending',
        urgency: classification.classification,
        raw_text: rawText,
        confidence: geo ? 1 : 0.6,
        status,
        assigned_to: null,
        ngo_id: Deno.env.get('DEFAULT_NGO_ID') || 'unknown',
        contact_number: from,
      });

    if (error) {
      console.error('Failed to create need from message:', error);
      return new Response('<Response><Message>Sorry, we could not create your request.</Message></Response>', {
        status: 500,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    if (status === 'unassigned') {
      const matches = await matchVolunteers(needIdNew, []);
      const topVolunteerId = matches[0] ?? null;

      if (topVolunteerId) {
        const updateResult = await supabase
          .from('needs')
          .update({
            status: 'pending_acceptance',
            updated_at: new Date().toISOString(),
          })
          .eq('need_id', needIdNew);

        if (updateResult.error) throw updateResult.error;

        await insertMatchLog(needIdNew, topVolunteerId);
        await notifyVolunteer(topVolunteerId, needIdNew);
      }
    }

    return new Response(
      `<Response><Message>Request received. Your Need ID is ${needIdNew}. We are matching a volunteer now. Reply YES to receive the assigned volunteer details.</Message></Response>`,
      { status: 200, headers: { 'Content-Type': 'text/xml' } },
    );
  }

  if (!needId || !volunteerId || (response !== 'YES' && response !== 'NO')) {
    if (isTwilioForm) {
      return new Response('<Response><Message>Invalid response. Reply YES or NO.</Message></Response>', {
        status: 400,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    return jsonResponse({ error: 'Missing or invalid payload' }, 400);
  }

  try {
    const need = await loadNeed(needId);
    if (!need) {
      return jsonResponse({ error: 'Need not found' }, 404);
    }

    let nextVolunteerId: string | null = null;
    let assignedSummaryMessage = 'Assigned';

    if (response === 'YES') {
      const updateResult = await supabase
        .from('needs')
        .update({
          assigned_to: volunteerId,
          status: 'assigned',
          updated_at: new Date().toISOString(),
        })
        .eq('need_id', needId);

      if (updateResult.error) throw updateResult.error;
      const volunteer = await loadVolunteerInfo(volunteerId);
      const requesterContact = await supabase
        .from('needs')
        .select('contact_number')
        .eq('need_id', needId)
        .maybeSingle<{ contact_number: string | null }>();

      if (requesterContact.error) throw requesterContact.error;

      if (requesterContact.data?.contact_number && volunteer) {
        const summary = formatVolunteerSummary(volunteer);
        assignedSummaryMessage = `Volunteer assigned for Need ${needId}:\n${summary}`;
        await sendTwilioMessage(
          requesterContact.data.contact_number,
          `Volunteer assigned for Need ${needId}:
${summary}`,
        );
      }
    } else {
      const matches = await matchVolunteers(needId, [volunteerId]);
      nextVolunteerId = matches[0] ?? null;

      const updateResult = await supabase
        .from('needs')
        .update({
          assigned_to: null,
          status: nextVolunteerId ? 'pending_acceptance' : 'unassigned',
          updated_at: new Date().toISOString(),
        })
        .eq('need_id', needId);

      if (updateResult.error) throw updateResult.error;

      if (nextVolunteerId) {
        await notifyVolunteer(nextVolunteerId, needId);
      }
    }

    const finalStatus = response === 'YES'
      ? 'assigned'
      : nextVolunteerId
        ? 'pending_acceptance'
        : 'unassigned';

    if (isTwilioForm) {
      const message = response === 'YES'
        ? assignedSummaryMessage
        : nextVolunteerId
          ? 'Declined. Next volunteer notified.'
          : 'Declined. No other volunteers available.';

      return new Response(`<Response><Message>${message}</Message></Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    return jsonResponse({
      ok: true,
      needId,
      volunteerId,
      response,
      status: finalStatus,
      nextVolunteerId,
    }, 200);
  } catch (error) {
    console.error('volunteer-response failed:', error);
    return jsonResponse({ error: 'Failed to process response' }, 500);
  }
});
