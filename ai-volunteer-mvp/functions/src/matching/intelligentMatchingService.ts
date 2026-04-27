import { supabase } from '../lib/supabaseClient';
import type { Volunteer } from '../shared-types';

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

type RankedVolunteer = {
  volunteerId: string;
  score: number;
  explanation: {
    proximity: number;
    skill: number;
    availability: number;
    workload: number;
    fairness: number;
  };
};

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parsePoint(value: unknown): { lat: number; lng: number } | null {
  if (!value) {
    return null;
  }

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
  }

  return null;
}

async function loadNeed(needId: string): Promise<NeedRow> {
  const { data, error } = await supabase
    .from('needs')
    .select('need_id, category, location_geo, status')
    .eq('need_id', needId)
    .maybeSingle<NeedRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Need not found');
  }

  return data;
}

async function loadCandidateVolunteers(needGeo: { lat: number; lng: number }, needCategory: string, maxDistanceKm: number): Promise<CandidateVolunteerRow[]> {
  // PostGIS note:
  // The RPC should implement:
  //   WHERE status = 'available'
  //     AND ST_DWithin(
  //       location,
  //       ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
  //       p_radius_meters
  //     )
  //   AND skills ?| ARRAY[p_category]
  // Recommended indexes:
  //   - GIST on volunteers.location
  //   - GIN on volunteers.skills
  //   - B-tree on volunteers.status
  const { data, error } = await supabase.rpc('match_volunteers_for_need', {
    p_lat: needGeo.lat,
    p_lng: needGeo.lng,
    p_radius_meters: Math.round(maxDistanceKm * 1000),
    p_category: needCategory,
    p_limit: 100
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as CandidateVolunteerRow[];
}

export async function matchVolunteers(needId: string, maxDistanceKm = 10, excludedVolunteerIds: string[] = []): Promise<RankedVolunteer[]> {
  const  need = await loadNeed(needId);
  const needGeo = parsePoint(need.location_geo);

  if (!needGeo) throw new Error('Location unresolved');

  const excludedVolunteerSet = new Set(excludedVolunteerIds);
  const candidates = (await loadCandidateVolunteers(needGeo, need.category, maxDistanceKm))
    .filter(candidate => !excludedVolunteerSet.has(candidate.id));
  if (!candidates.length) {
    return [];
  }

  const { lat: nLat, lng: nLng } = needGeo;

  return candidates.map((v: CandidateVolunteerRow) => {
    const volunteerGeo = parsePoint(v.location) || { lat: nLat, lng: nLng };
    const dist = haversine(nLat, nLng, volunteerGeo.lat, volunteerGeo.lng);
    const proximity = Math.max(0, 1 - dist/maxDistanceKm);
    const skill = v.skills.includes(need.category) ? 1.0 : 0.3;
    const avail = v.historical_response_rate;
    const workload = 1 - Math.min(1, v.active_tasks/v.typical_capacity);
    const fairness = 1 - Math.min(1, v.total_assignments/50);

    const score = 0.25*proximity + 0.25*skill + 0.20*avail + 0.15*workload + 0.15*fairness;
    return {
      volunteerId: v.id,
      score: Math.round(score*100)/100,
      explanation: { proximity: Math.round(proximity*100)/100, skill, availability: Math.round(avail*100)/100, workload: Math.round(workload*100)/100, fairness: Math.round(fairness*100)/100 }
    };
  }).sort((a,b) => b.score - a.score).slice(0,3);
}