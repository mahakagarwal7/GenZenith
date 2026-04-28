import { supabase } from '../_shared/supabase.ts';
import { jsonResponse, methodNotAllowed, parseJsonBody } from '../_shared/http.ts';

type VolunteerImportRow = {
  full_name: string;
  contact_number?: string | null;
  skills?: string[] | string;
  city?: string | null;
  region?: string | null;
  location_text?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  status?: string | null;
  typical_capacity?: number | null;
};

function toSkillArray(value: VolunteerImportRow['skills']): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function toPostgisPoint(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

async function geocodeAddress(text: string): Promise<{ lat: number; lng: number; city?: string; region?: string } | null> {
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) return null;

  const endpoint = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(endpoint);
  if (!resp.ok) return null;

  const payload = await resp.json();
  const result = payload?.results?.[0];
  const location = result?.geometry?.location;
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return null;

  const components = result?.address_components as Array<{ long_name: string; types: string[] }> | undefined;
  const cityComp = components?.find((c) => c.types.includes('locality'))
    || components?.find((c) => c.types.includes('administrative_area_level_2'))
    || components?.find((c) => c.types.includes('administrative_area_level_1'));
  const regionComp = components?.find((c) => c.types.includes('administrative_area_level_1'))
    || components?.find((c) => c.types.includes('administrative_area_level_2'))
    || components?.find((c) => c.types.includes('locality'));

  return {
    lat: location.lat,
    lng: location.lng,
    city: cityComp?.long_name,
    region: regionComp?.long_name,
  };
}

async function reverseGeocode(lat: number, lng: number): Promise<{ city?: string; region?: string } | null> {
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) return null;

  const endpoint = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(endpoint);
  if (!resp.ok) return null;

  const payload = await resp.json();
  const result = payload?.results?.[0];
  const components = result?.address_components as Array<{ long_name: string; types: string[] }> | undefined;
  const cityComp = components?.find((c) => c.types.includes('locality'))
    || components?.find((c) => c.types.includes('administrative_area_level_2'))
    || components?.find((c) => c.types.includes('administrative_area_level_1'));
  const regionComp = components?.find((c) => c.types.includes('administrative_area_level_1'))
    || components?.find((c) => c.types.includes('administrative_area_level_2'))
    || components?.find((c) => c.types.includes('locality'));

  return { city: cityComp?.long_name, region: regionComp?.long_name };
}

function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('NGO_INGEST_BEARER_TOKEN');
  if (!expected) return false;

  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return match[1] === expected;
}

Deno.serve(async (req) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    return jsonResponse({ status: 'healthy', timestamp: new Date().toISOString() });
  }

  if (req.method !== 'POST') return methodNotAllowed();

  if (!isAuthorized(req)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = await parseJsonBody(req) as { ngo_id?: string; volunteers?: VolunteerImportRow[] };
    const ngoId = payload.ngo_id;
    const volunteers = payload.volunteers;

    if (!ngoId || !Array.isArray(volunteers) || volunteers.length === 0) {
      return jsonResponse({ error: 'Missing ngo_id or volunteers[]' }, 400);
    }

    const created: Array<{ id: string; full_name: string }> = [];
    const rejected: Array<{ full_name?: string; reason: string }> = [];

    for (const v of volunteers) {
      if (!v?.full_name || String(v.full_name).trim().length < 2) {
        rejected.push({ full_name: v?.full_name, reason: 'Missing full_name' });
        continue;
      }

      const skills = toSkillArray(v.skills);

      let lat = typeof v.location_lat === 'number' ? v.location_lat : null;
      let lng = typeof v.location_lng === 'number' ? v.location_lng : null;
      let city = v.city ?? null;
      let region = v.region ?? null;

      if ((lat === null || lng === null) && v.location_text) {
        const geo = await geocodeAddress(v.location_text);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          city = city ?? geo.city ?? null;
          region = region ?? geo.region ?? null;
        }
      }

      if (lat !== null && lng !== null && (!city || !region)) {
        const rev = await reverseGeocode(lat, lng);
        if (rev) {
          city = city ?? rev.city ?? null;
          region = region ?? rev.region ?? null;
        }
      }

      if (lat === null || lng === null) {
        rejected.push({ full_name: v.full_name, reason: 'Missing location_lat/location_lng (or geocode failed)' });
        continue;
      }

      const id = crypto.randomUUID();
      const status = v.status || 'available';

      const { data, error } = await supabase
        .from('volunteers')
        .insert({
          id,
          full_name: v.full_name,
          contact_number: v.contact_number ?? null,
          skills,
          city,
          region,
          ngo_id: ngoId,
          location: toPostgisPoint(lat, lng),
          status,
          typical_capacity: typeof v.typical_capacity === 'number' ? v.typical_capacity : 1,
        })
        .select('id, full_name')
        .single<{ id: string; full_name: string }>();

      if (error || !data) {
        rejected.push({ full_name: v.full_name, reason: error?.message || 'Insert failed' });
        continue;
      }

      created.push({ id: data.id, full_name: data.full_name });
    }

    return jsonResponse({
      ok: true,
      ngo_id: ngoId,
      imported_count: created.length,
      imported: created,
      rejected_count: rejected.length,
      rejected,
    }, 201);
  } catch (error) {
    console.error('ngo-volunteer-import failed:', error);
    return jsonResponse({ error: 'Import failed' }, 500);
  }
});
