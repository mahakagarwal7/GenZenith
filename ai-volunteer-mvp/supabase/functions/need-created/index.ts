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

function extractNeedId(payload: Record<string, unknown>): string | null {
  const record = payload.record as Record<string, unknown> | undefined;
  const candidates = [
    record?.need_id,
    record?.needId,
    payload.need_id,
    payload.needId,
    payload.id,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value) {
      return value;
    }
  }

  return null;
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

async function rankVolunteers(need: NeedRow): Promise<Array<{ volunteerId: string; score: number }>> {
  const needGeo = parsePoint(need.location_geo);
  if (!needGeo) return [];

  const rpc = await supabase.rpc('match_volunteers_for_need', {
    p_lat: needGeo.lat,
    p_lng: needGeo.lng,
    p_radius_meters: 10000,
    p_category: need.category,
    p_limit: 100,
  });

  let candidates: CandidateVolunteerRow[] = [];
  if (rpc.error) {
    console.warn(`RPC match_volunteers_for_need failed: ${rpc.error.message}. Falling back to standard query.`);
    const fallback = await supabase.from('volunteers').select('*').eq('status', 'available').limit(10);
    candidates = (fallback.data ?? []) as any[];
  } else {
    candidates = (rpc.data ?? []) as CandidateVolunteerRow[];
  }

  return candidates
    .map((candidate) => {
      const volunteerGeo = parsePoint(candidate.location) || needGeo;
      const distance = haversine(needGeo.lat, needGeo.lng, volunteerGeo.lat, volunteerGeo.lng);
      const proximity = Math.max(0, 1 - distance / 10);
      const skill = candidate.skills.includes(need.category) ? 1 : 0.3;
      const availability = candidate.historical_response_rate;
      const workload = 1 - Math.min(1, candidate.active_tasks / Math.max(candidate.typical_capacity, 1));
      const fairness = 1 - Math.min(1, candidate.total_assignments / 50);
      const score = 0.25 * proximity + 0.25 * skill + 0.2 * availability + 0.15 * workload + 0.15 * fairness;
      return {
        volunteerId: candidate.id,
        score: Math.round(score * 100) / 100,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return methodNotAllowed();
  }

  const payload = await parseJsonBody(req);
  const needId = extractNeedId(payload);

  if (!needId) {
    return jsonResponse({ error: 'Missing need id' }, 400);
  }

  try {
    const need = await loadNeed(needId);

    if (!need) {
      return jsonResponse({ ok: true, skipped: true, reason: 'Need not found', needId }, 200);
    }

    if (need.status === 'needs_validation' || !need.location_geo) {
      return jsonResponse({ ok: true, skipped: true, reason: 'Need not ready for matching', needId }, 200);
    }

    const matches = await rankVolunteers(need);

    const updateResult = await supabase
      .from('needs')
      .update({
        status: 'pending_acceptance',
        updated_at: new Date().toISOString(),
      })
      .eq('need_id', needId);

    if (updateResult.error) throw updateResult.error;

    const topVolunteerId = matches[0]?.volunteerId ?? null;

    const logResult = await supabase.from('match_logs').insert({
      need_id: needId,
      volunteer_id: topVolunteerId,
      match_score: matches[0]?.score ?? 0,
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'need-created-edge-function',
        matchedCount: matches.length,
      },
    });

    if (logResult.error) throw logResult.error;

    await Promise.all(matches.slice(0, 3).map((item) => notifyVolunteer(item.volunteerId, needId)));

    return jsonResponse({ ok: true, needId, matchedCount: matches.length, topVolunteerId }, 200);
  } catch (error) {
    console.error('need-created failed:', error);
    return jsonResponse({ error: 'Failed to process need' }, 500);
  }
});
