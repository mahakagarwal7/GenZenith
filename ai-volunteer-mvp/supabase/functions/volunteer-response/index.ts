import { supabase } from '../_shared/supabase.ts';
import { jsonResponse, methodNotAllowed, parseJsonBody } from '../_shared/http.ts';
import { aiTriage } from '../_shared/ai.ts';

type NeedRow = {
  need_id: string;
  category: string;
  location_geo: unknown | null;
  status: string;
  region?: string | null;
  contact_number?: string | null;
  metadata?: unknown | null;
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
  city?: string | null;
  region?: string | null;
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

function normalizeArea(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function areaMatches(targetArea: string, candidateArea: string | null | undefined): boolean {
  if (!targetArea) return true;
  if (!candidateArea) return false;
  
  const target = normalizeArea(targetArea);
  const candidate = normalizeArea(candidateArea);
  
  // Fuzzy match: if either string contains the other (e.g., "New Delhi" matches "Delhi")
  return candidate.includes(target) || target.includes(candidate);
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  medical: ['blood', 'doctor', 'hospital', 'medicine', 'injury', 'accident', 'bleeding', 'oxygen'],
  water_supply: ['water', 'tanker', 'dry', 'dehydration', 'well', 'pipeline'],
  logistics: ['transport', 'road', 'blocked', 'delivery', 'supplies', 'vehicle'],
  food: ['food', 'ration', 'hunger', 'meal', 'grain', 'kitchen'],
  general: ['help', 'need', 'assist'],
};



async function geocodeLocation(text: string): Promise<{ lat: number; lng: number; city?: string; region?: string } | null> {
  if (!text || text.length < 3) return null;

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) {
    console.error('CRITICAL ERROR: GOOGLE_MAPS_API_KEY is missing from environment variables.');
    return null;
  }

  try {
    const endpoint = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${encodeURIComponent(apiKey)}`;
    console.log(`[GEO] Attempting to geocode: "${text}"`);

    const response = await fetch(endpoint);
    const data = await response.json();

    if (data.status === 'OK' && data.results?.[0]) {
      const result = data.results[0];
      const { lat, lng } = result.geometry.location;
      
      // Extract city and region with Locality Priority
      const components = result.address_components as Array<{ long_name: string, types: string[] }>;
      
      const locality = components.find(c => c.types.includes('locality'))?.long_name;
      const sublocality = components.find(c => c.types.includes('sublocality'))?.long_name;
      const district = components.find(c => c.types.includes('administrative_area_level_2'))?.long_name;
      const state = components.find(c => c.types.includes('administrative_area_level_1'))?.long_name;

      // Consistent extraction: city is the most specific locality
      const city = locality || sublocality || district || state;
      
      // Region is the broader locality or state
      const region = locality || district || state;

      console.log(`[GEO] SUCCESS: Resolved "${text}" -> City: ${city}, Region: ${region} at (${lat}, ${lng})`);
      
      return { lat, lng, city, region };
    } else {
      console.warn(`[GEO] FAILED: Google API returned status: ${data.status}. Message: ${data.error_message || 'None'}`);
      return null;
    }
  } catch (error) {
    console.error('[GEO] FATAL ERROR:', error);
    return null;
  }
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
    .select('need_id, category, location_geo, status, region, contact_number, metadata')
    .eq('need_id', needId)
    .maybeSingle<NeedRow>();

  if (error) throw error;
  return data ?? null;
}

async function loadLatestNeedForContact(contactNumber: string): Promise<{ need_id: string; status: string; assigned_to: string | null } | null> {
  const { data, error } = await supabase
    .from('needs')
    .select('need_id, status, assigned_to, submitted_at')
    .eq('contact_number', contactNumber)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ need_id: string; status: string; assigned_to: string | null }>();

  if (error) throw error;
  return data ?? null;
}

async function loadLatestMatchedVolunteerForNeed(needId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('match_logs')
    .select('volunteer_id')
    .eq('need_id', needId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle<{ volunteer_id: string | null }>();

  if (error) throw error;
  return data?.volunteer_id ?? null;
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

async function matchVolunteers(needId: string, excludedVolunteerIds: string[], p_city?: string, p_region?: string): Promise<string[]> {
  const need = await loadNeed(needId);
  if (!need) return [];

  const needGeo = parsePoint(need.location_geo);
  if (!needGeo) return [];

  // Use the city/region name from parameters if available
  const targetCity = p_city;
  const targetRegion = p_region ?? (need.region ?? undefined);

  let rpc = await supabase.rpc('match_volunteers_for_need', {
    p_lat: needGeo.lat,
    p_lng: needGeo.lng,
    p_radius_meters: 10000, // Try 10km first
    p_category: need.category,
    p_limit: 100,
  });

  if (rpc.error) throw rpc.error;

  let candidates = (rpc.data ?? []) as CandidateVolunteerRow[];

  // Region tightening when provided.
  if (targetRegion) {
    candidates = candidates.filter((c) => 
      areaMatches(targetRegion, c.region) || 
      areaMatches(targetRegion, c.city)
    );
  }

  // Optional city tightening when provided.
  if (targetCity) {
    candidates = candidates.filter((c) => 
      areaMatches(targetCity, c.city) || 
      areaMatches(targetCity, c.region)
    );
  }

  // Fallback 1: If no matches in 10km, try 100km
  if (candidates.length === 0) {
    console.log(`No matches within 10km for need ${needId}, expanding to 100km...`);
    rpc = await supabase.rpc('match_volunteers_for_need', {
      p_lat: needGeo.lat,
      p_lng: needGeo.lng,
      p_radius_meters: 100000, // 100km
      p_category: need.category,
      p_limit: 100,
    });
    if (rpc.error) throw rpc.error;
    candidates = (rpc.data ?? []) as CandidateVolunteerRow[];

    if (targetRegion) {
      candidates = candidates.filter((c) => areaMatches(targetRegion, c.region ?? c.city ?? null));
    }
    
    // Re-apply city filter to expanded pool
    if (targetCity) {
      const normalizedTarget = normalizeArea(targetCity);
      candidates = candidates.filter((c) => {
        if (!c.city) return true;
        const cCity = normalizeArea(c.city);
        return cCity.includes(normalizedTarget) || normalizedTarget.includes(cCity);
      });
    }
  }

  // Fallback 2: Strict DB filter by region/city BUT still require real geo.
  if (candidates.length === 0 && (targetRegion || targetCity)) {
    const label = targetRegion ? `region: ${targetRegion}` : `city: ${targetCity}`;
    console.log(`No matches by coordinates for need ${needId}, checking strict ${label}`);

    let query = supabase
      .from('volunteers')
      .select('id, location, skills, historical_response_rate, typical_capacity, total_assignments, active_tasks, contact_number, city, region')
      .eq('status', 'available')
      .not('location', 'is', null)
      .limit(50);

    if (targetRegion) {
      query = query.ilike('region', `%${targetRegion}%`);
    } else if (targetCity) {
      query = query.ilike('city', `%${targetCity}%`);
    }

    const { data: pool, error: poolError } = await query;
    if (!poolError && pool) {
      candidates = pool as unknown as CandidateVolunteerRow[];
    }
  }

  const excluded = new Set(excludedVolunteerIds);

  // Exclude volunteers who have recently declined any assignment.
  if (candidates.length > 0) {
    const candidateIds = Array.from(new Set(candidates.map((c) => c.id)));
    const { data: declines, error: declinesError } = await supabase
      .from('volunteer_declines')
      .select('volunteer_id')
      .in('volunteer_id', candidateIds)
      .gt('expires_at', new Date().toISOString());
    if (!declinesError && declines) {
      for (const row of declines as Array<{ volunteer_id: string }>) {
        excluded.add(row.volunteer_id);
      }
    }
  }

  const ranked = candidates
    .filter((candidate) => !excluded.has(candidate.id))
    .map((candidate) => {
      const candidateLoc = parsePoint(candidate.location);
      const volunteerGeo = candidateLoc || { lat: 0, lng: 0 }; 
      
      let distance = 999999; 
      if (candidateLoc) {
        distance = haversine(needGeo.lat, needGeo.lng, volunteerGeo.lat, volunteerGeo.lng);
      }

      const proximity = candidateLoc ? Math.max(0, 1 - distance / 100) : 0; 
      const cityBoost = (targetCity && candidate.city && areaMatches(targetCity, candidate.city)) ? 0.9 : 0;
      const regionBoost = (targetRegion && (areaMatches(targetRegion, candidate.region ?? null) || areaMatches(targetRegion, candidate.city ?? null))) ? 0.5 : 0;
      
      // Fuzzy Skill Match: check if any volunteer skill contains the category or vice versa
      const category = need.category.toLowerCase();
      const hasSkill = candidate.skills.some(s => {
        const ls = s.toLowerCase();
        return ls.includes(category) || category.includes(ls);
      });
      
      const skillScore = hasSkill ? 1 : 0.3;
      const availability = candidate.historical_response_rate;
      const workload = 1 - Math.min(1, candidate.active_tasks / Math.max(candidate.typical_capacity, 1));
      const fairness = 1 - Math.min(1, candidate.total_assignments / 50);
      
      const score = (0.3 * proximity) + (0.35 * cityBoost) + (0.15 * regionBoost) + (0.1 * skillScore) + (0.05 * availability) + (0.03 * workload) + (0.02 * fairness);
      return { id: candidate.id, score };
    })
    .filter(item => item.score > 0.15) // Stricter threshold
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
  // Use the Twilio WhatsApp Sandbox number by default for testing
  const whatsappFrom = Deno.env.get('TWILIO_WHATSAPP_SANDBOX') || Deno.env.get('TWILIO_WHATSAPP_NUMBER') || 'whatsapp:+14155238886';
  const fromStr = isWhatsApp ? whatsappFrom : from;

  if (!fromStr) {
    return false;
  }

  const body = new URLSearchParams({
    To: volunteer.data.contact_number,
    From: fromStr,
    Body: `🚨 GENZENITH ALERT: New ${need.category.toUpperCase()} need detected!
📍 Location: ${need.location_text || 'Near you'}
🔥 Urgency: ${need.urgency.toUpperCase()}

Reply YES to accept or NO to decline.
Or view details: https://genzenith.in/mission/${needId}`,
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
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    return jsonResponse({ status: 'healthy', timestamp: new Date().toISOString() });
  }

  if (req.method !== 'POST') {

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

  const from = typeof payload.From === 'string' ? payload.From : '';
  const bodyText = typeof payload.Body === 'string' ? payload.Body.trim() : '';
  const upperBody = bodyText.toUpperCase();
  
  let needId = typeof payload.needId === 'string' ? payload.needId : '';
  let volunteerId = typeof payload.volunteerId === 'string' ? payload.volunteerId : '';
  let response = typeof payload.response === 'string' ? payload.response : '';
  const action = typeof payload.action === 'string' ? payload.action : '';

  // 0. MANUAL REMATCH TRIGGER (from dashboard)
  if (action === 'REMATCH' && needId) {
    const need = await loadNeed(needId);
    if (!need) return jsonResponse({ error: 'Need not found' }, 404);

    // Get city from metadata or fallback
    const metadata = (need.metadata ?? null) as any;
    const resolvedCity = metadata?.geocoding_details?.city || 'Unknown';
    const resolvedRegion = need.region || metadata?.geocoding_details?.region || null;
    const matches = await matchVolunteers(needId, [], resolvedCity, resolvedRegion || undefined);
    const topVolunteerId = matches[0] ?? null;

    if (topVolunteerId) {
      await supabase
        .from('needs')
        .update({ status: 'pending_acceptance', updated_at: new Date().toISOString() })
        .eq('need_id', needId);

      await insertMatchLog(needId, topVolunteerId);
      await notifyVolunteer(topVolunteerId, needId);
      
      return jsonResponse({ ok: true, matched: true, volunteerId: topVolunteerId }, 200);
    }
    
    return jsonResponse({ ok: true, matched: false, message: 'No local volunteers found' }, 200);
  }

  // 1. MASTER ROUTING LOGIC
  
  // A. Check if this is a VOLUNTEER responding YES/NO
  if (from && (upperBody === 'YES' || upperBody === 'NO')) {
    const { data: volunteers } = await supabase
      .from('volunteers')
      .select('id')
      .eq('contact_number', from)
      .limit(10);

    const volunteerRows = (volunteers ?? []) as Array<{ id: string | null }>;
    const ids = volunteerRows
      .map((v) => v.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) {
      // Find the latest match across any volunteer row with this contact_number.
      const { data: match } = await supabase
        .from('match_logs')
        .select('need_id, volunteer_id')
        .in('volunteer_id', ids)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle<{ need_id: string; volunteer_id: string | null }>();

      if (match?.need_id && match.volunteer_id) {
        volunteerId = match.volunteer_id;
        needId = match.need_id;
        response = upperBody;
      }
    }
  }

  // B. If not a volunteer acceptance, check if it's a REQUESTER checking status with YES/NO
  if (!volunteerId && from && (upperBody === 'YES' || upperBody === 'NO')) {
    const latestNeed = await loadLatestNeedForContact(from);
    if (latestNeed) {
      if (upperBody === 'NO') {
        return new Response('<Response><Message>Your request is still being handled. We will keep looking for a volunteer.</Message></Response>', {
          status: 200,
          headers: { 'Content-Type': 'text/xml', ...getCorsHeaders() },
        });
      }

      const matchedVolunteerId = latestNeed.assigned_to || await loadLatestMatchedVolunteerForNeed(latestNeed.need_id);
      if (!matchedVolunteerId) {
        return new Response('<Response><Message>A volunteer is still being matched. Please wait a moment and try YES again.</Message></Response>', {
          status: 200,
          headers: { 'Content-Type': 'text/xml', ...getCorsHeaders() },
        });
      }

      const volunteer = await loadVolunteerInfo(matchedVolunteerId);
      const summary = volunteer ? formatVolunteerSummary(volunteer) : 'A volunteer has been matched.';
      const prefix = latestNeed.assigned_to ? 'Volunteer assigned' : 'Volunteer matched';

      return new Response(`<Response><Message>${prefix} for Need ${latestNeed.need_id}:\n${summary}</Message></Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml', ...getCorsHeaders() },
      });
    }
  }

  // C. If it's a NEW REQUEST (NOT YES/NO)
  if (isTwilioForm && upperBody !== 'YES' && upperBody !== 'NO' && from) {
    const triage = await aiTriage(bodyText);
    const geo = await geocodeLocation(triage.location_text);
    const resolvedCity = geo?.city || 'Unknown';
    const resolvedRegion = geo?.region || undefined;
    
    const status = !geo ? 'needs_validation' : 'unassigned';
    const needIdNew = crypto.randomUUID();

    const { error } = await supabase
      .from('needs')
      .insert({
        need_id: needIdNew,
        source: 'whatsapp',
        submitted_at: new Date().toISOString(),
        location_geo: toPostgisPoint(geo),
        location_text: triage.location_text,
        category: triage.category,
        subcategory: 'pending',
        urgency: triage.urgency,
        raw_text: bodyText,
        confidence: geo ? triage.confidence : 0.6,
        status,
        assigned_to: null,
        ngo_id: Deno.env.get('DEFAULT_NGO_ID') || 'unknown',
        contact_number: from,
        region: resolvedRegion || null,
        metadata: {
          ingestion_source: 'master_router_whatsapp',
          ai_triage: triage,
          geocoding: geo ? 'success' : 'failed'
        }
      });

    if (error) {
      console.error('Failed to create need from message:', error);
      return new Response('<Response><Message>Sorry, we could not create your request.</Message></Response>', {
        status: 500,
        headers: { 'Content-Type': 'text/xml', ...getCorsHeaders() },
      });
    }

    if (status === 'unassigned') {
      const matches = await matchVolunteers(needIdNew, [], resolvedCity !== 'Unknown' ? resolvedCity : undefined, resolvedRegion);
      const topVolunteerId = matches[0] ?? null;

      if (topVolunteerId) {
        await supabase
          .from('needs')
          .update({ status: 'pending_acceptance', updated_at: new Date().toISOString() })
          .eq('need_id', needIdNew);

        await insertMatchLog(needIdNew, topVolunteerId);
        await notifyVolunteer(topVolunteerId, needIdNew);
      } else {
        // Inform requester that no local volunteers are found
        const regionMsg = resolvedRegion ? ` in ${resolvedRegion}` : (geo?.city ? ` in ${geo.city}` : '');
        return new Response(
          `<Response><Message>Request received (ID: ${needIdNew}). Currently, we have no available volunteers${regionMsg}. We will notify you as soon as one is found. If you know a volunteer in this area, they can register at https://genzenith.in/register</Message></Response>`,
          { status: 200, headers: { 'Content-Type': 'text/xml', ...getCorsHeaders() } },
        );
      }
    }

    if (status === 'needs_validation') {
      return new Response(
        `<Response><Message>Request received (ID: ${needIdNew}). We could not confirm your location. Please reply with your city/region (example: "LOCATION: Kolkata, West Bengal").</Message></Response>`,
        { status: 200, headers: { 'Content-Type': 'text/xml', ...getCorsHeaders() } },
      );
    }

    return new Response(
      `<Response><Message>Request received. Your Need ID is ${needIdNew}. We are matching a volunteer now. Reply YES to receive the assigned volunteer details.</Message></Response>`,
      { status: 200, headers: { 'Content-Type': 'text/xml', ...getCorsHeaders() } },
    );
  }

  // Final check for explicit JSON payloads (like from the frontend simulation)
  if (!needId && payload.needId) needId = payload.needId as string;
  if (!volunteerId && payload.volunteerId) volunteerId = payload.volunteerId as string;
  if (!response && payload.response) response = payload.response as string;
  if (!response && payload.Body) response = payload.Body as string; // Support Body as fallback for response

  const upperResponse = response.trim().toUpperCase();

  if (!needId || !volunteerId || (upperResponse !== 'YES' && upperResponse !== 'NO')) {
    if (isTwilioForm) {
      return new Response('<Response><Message>We received your message. If you are replying to a match, please ensure you use YES or NO.</Message></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml', ...getCorsHeaders() },
      });
    }
    return jsonResponse({ error: 'Missing or invalid payload', needId, volunteerId, response: upperResponse }, 400);
  }

  // --- LOGIC FOR PROCESSING YES/NO ---
  try {
    let nextVolunteerId: string | null = null;
    let assignedSummaryMessage = 'Assigned';

    if (upperResponse === 'YES') {
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
      // Cooldown this volunteer so they aren't repeatedly re-assigned.
      await supabase.from('volunteer_declines').insert({ volunteer_id: volunteerId });

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
        // Ensure the next volunteer can reply YES/NO and be mapped to this need.
        await insertMatchLog(needId, nextVolunteerId);
        await notifyVolunteer(nextVolunteerId, needId);
      } else {
        // Inform requester that no volunteer matched in the required area.
        const { data: requester, error: requesterError } = await supabase
          .from('needs')
          .select('contact_number, region')
          .eq('need_id', needId)
          .maybeSingle<{ contact_number: string | null; region: string | null }>();
        if (!requesterError && requester?.contact_number) {
          const area = requester.region ? ` in ${requester.region}` : '';
          await sendTwilioMessage(requester.contact_number, `No volunteers matched${area} for Need ${needId} right now.`);
        }
      }
    }

    const finalStatus = upperResponse === 'YES'
      ? 'assigned'
      : nextVolunteerId
        ? 'pending_acceptance'
        : 'unassigned';

    if (isTwilioForm) {
      const message = upperResponse === 'YES'
        ? assignedSummaryMessage
        : nextVolunteerId
          ? 'Declined. Next volunteer notified.'
          : 'Declined. No other volunteers available.';

      return new Response(`<Response><Message>${message}</Message></Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml', ...getCorsHeaders() },
      });
    }

    return jsonResponse({
      ok: true,
      needId,
      volunteerId,
      response: upperResponse,
      status: finalStatus,
      nextVolunteerId,
    }, 200);
  } catch (error) {
    console.error('volunteer-response failed:', error);
    return jsonResponse({ error: 'Failed to process response' }, 500);
  }
});
