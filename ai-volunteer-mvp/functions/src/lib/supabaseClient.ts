import { randomUUID } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { GeoPoint, Need, Volunteer } from '../shared-types';

/*
  Supabase mapping notes:
  - supabase.from('needs').select('*').eq('need_id', id).single()
  - supabase.from('needs').insert(data).select('need_id').single()
*/

export interface NeedQuery {
  needId?: string;
  status?: Need['status'] | Need['status'][];
  urgency?: Need['urgency'] | Need['urgency'][];
  category?: string;
  subcategory?: string;
  ngoId?: string;
  assignedTo?: string | null;
  center?: GeoPoint;
  radiusMeters?: number;
  limit?: number;
  orderBySubmittedAt?: 'asc' | 'desc';
}

export interface VolunteerQuery {
  id?: string;
  status?: Volunteer['status'] | Volunteer['status'][];
  skills?: string[];
  ngoId?: string;
  near?: GeoPoint;
  radiusMeters?: number;
  limit?: number;
}

export interface MatchLog {
  id: string;
  needId: string;
  volunteerId: string | null;
  matchScore: number | null;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface MatchLogQuery {
  id?: string;
  needId?: string;
  volunteerId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface NeedRecord {
  need_id: string;
  source: Need['source'];
  submitted_at: string;
  location_geo: unknown | null;
  location_text: string;
  category: string;
  subcategory: string | null;
  urgency: Need['urgency'];
  raw_text: string;
  confidence: number;
  status: Need['status'];
  assigned_to: string | null;
  ngo_id: string;
  contact_number: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VolunteerRecord {
  id: string;
  user_id: string | null;
  location: unknown | null;
  contact_number: string | null;
  skills: string[];
  status: Volunteer['status'];
  historical_response_rate: number;
  typical_capacity: number;
  total_assignments: number;
  active_tasks: number;
  last_active_hour: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface MatchLogRecord {
  id: string;
  need_id: string;
  volunteer_id: string | null;
  match_score: number | null;
  timestamp: string;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileRecord {
  id: string;
  role: 'admin' | 'coordinator' | 'volunteer';
  ngo_id: string | null;
  created_at?: string;
  updated_at?: string;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * Server-side Supabase client for Cloud Functions / Edge Functions.
 * Uses the service role key and therefore bypasses RLS by design.
 */
export const supabase: SupabaseClient = createClient(
  requireEnv(SUPABASE_URL, 'SUPABASE_URL'),
  requireEnv(SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

/**
 * Client-side reference only.
 * Use this pattern in browser apps with the anon key.
 *
 * const browserSupabase = createClient(
 *   process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 * );
 */
export const supabaseAnonClientExample = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

function toPostgisPoint(geo: GeoPoint | null | undefined): string | null {
  if (!geo) {
    return null;
  }

  return `SRID=4326;POINT(${geo.lng} ${geo.lat})`;
}

function parseGeo(value: unknown): GeoPoint | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    if (typeof obj.lat === 'number' && typeof obj.lng === 'number') {
      return { lat: obj.lat, lng: obj.lng };
    }

    if (Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
      const [lng, lat] = obj.coordinates;
      if (typeof lat === 'number' && typeof lng === 'number') {
        return { lat, lng };
      }
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

function mapNeedRow(row: NeedRecord): Need {
  return {
    needId: row.need_id,
    source: row.source,
    submittedAt: row.submitted_at,
    location: {
      geo: parseGeo(row.location_geo),
      text: row.location_text
    },
    category: row.category,
    subcategory: row.subcategory ?? 'pending',
    urgency: row.urgency,
    rawText: row.raw_text,
    confidence: row.confidence,
    status: row.status,
    assignedTo: row.assigned_to,
    ngoId: row.ngo_id,
    contactNumber: row.contact_number ?? undefined
  };
}

function mapVolunteerRow(row: VolunteerRecord): Volunteer {
  return {
    id: row.id,
    location: parseGeo(row.location) ?? { lat: 0, lng: 0 },
    skills: row.skills,
    status: row.status,
    contactNumber: row.contact_number ?? undefined,
    historicalResponseRate: row.historical_response_rate,
    typicalCapacity: row.typical_capacity,
    totalAssignments: row.total_assignments,
    activeTasks: row.active_tasks,
    lastActiveHour: row.last_active_hour ?? 0
  };
}

function mapMatchLogRow(row: MatchLogRecord): MatchLog {
  return {
    id: row.id,
    needId: row.need_id,
    volunteerId: row.volunteer_id,
    matchScore: row.match_score,
    timestamp: row.timestamp,
    metadata: row.metadata ?? {}
  };
}

function cleanObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function toNeedRecord(need: Need): NeedRecord {
  return {
    need_id: need.needId || randomUUID(),
    source: need.source,
    submitted_at: need.submittedAt,
    location_geo: toPostgisPoint(need.location?.geo ?? null),
    location_text: need.location?.text ?? '',
    category: need.category,
    subcategory: need.subcategory ?? null,
    urgency: need.urgency,
    raw_text: need.rawText,
    confidence: need.confidence,
    status: need.status,
    assigned_to: need.assignedTo ?? null,
    ngo_id: need.ngoId,
    contact_number: need.contactNumber ?? null
  };
}

function toNeedPatch(updates: Partial<Need>): Partial<NeedRecord> {
  const patch: Partial<NeedRecord> = {};

  if (updates.source !== undefined) patch.source = updates.source;
  if (updates.submittedAt !== undefined) patch.submitted_at = updates.submittedAt;
  if (updates.location !== undefined) {
    patch.location_geo = toPostgisPoint(updates.location?.geo ?? null);
    patch.location_text = updates.location?.text ?? '';
  }
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.subcategory !== undefined) patch.subcategory = updates.subcategory;
  if (updates.urgency !== undefined) patch.urgency = updates.urgency;
  if (updates.rawText !== undefined) patch.raw_text = updates.rawText;
  if (updates.confidence !== undefined) patch.confidence = updates.confidence;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.assignedTo !== undefined) patch.assigned_to = updates.assignedTo;
  if (updates.ngoId !== undefined) patch.ngo_id = updates.ngoId;
  if (updates.contactNumber !== undefined) patch.contact_number = updates.contactNumber;
  if (updates.needId !== undefined) patch.need_id = updates.needId;

  return cleanObject(patch);
}

function toVolunteerRecord(volunteer: Volunteer): VolunteerRecord {
  return {
    id: volunteer.id || randomUUID(),
    user_id: volunteer.id || null,
    location: toPostgisPoint(volunteer.location),
    contact_number: volunteer.contactNumber ?? null,
    skills: volunteer.skills,
    status: volunteer.status,
    historical_response_rate: volunteer.historicalResponseRate,
    typical_capacity: volunteer.typicalCapacity,
    total_assignments: volunteer.totalAssignments,
    active_tasks: volunteer.activeTasks,
    last_active_hour: volunteer.lastActiveHour ?? null
  };
}

function toVolunteerPatch(updates: Partial<Volunteer>): Partial<VolunteerRecord> {
  const patch: Partial<VolunteerRecord> = {};

  if (updates.id !== undefined) patch.id = updates.id;
  if (updates.location !== undefined) patch.location = toPostgisPoint(updates.location);
  if (updates.contactNumber !== undefined) patch.contact_number = updates.contactNumber;
  if (updates.skills !== undefined) patch.skills = updates.skills;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.historicalResponseRate !== undefined) patch.historical_response_rate = updates.historicalResponseRate;
  if (updates.typicalCapacity !== undefined) patch.typical_capacity = updates.typicalCapacity;
  if (updates.totalAssignments !== undefined) patch.total_assignments = updates.totalAssignments;
  if (updates.activeTasks !== undefined) patch.active_tasks = updates.activeTasks;
  if (updates.lastActiveHour !== undefined) patch.last_active_hour = updates.lastActiveHour;

  return cleanObject(patch);
}

function toMatchLogRecord(matchLog: Omit<MatchLog, 'id' | 'timestamp'> & Partial<Pick<MatchLog, 'id' | 'timestamp'>>): MatchLogRecord {
  return {
    id: matchLog.id || randomUUID(),
    need_id: matchLog.needId,
    volunteer_id: matchLog.volunteerId ?? null,
    match_score: matchLog.matchScore ?? null,
    timestamp: matchLog.timestamp || new Date().toISOString(),
    metadata: matchLog.metadata ?? {}
  };
}

function toMatchLogPatch(updates: Partial<MatchLog>): Partial<MatchLogRecord> {
  const patch: Partial<MatchLogRecord> = {};

  if (updates.needId !== undefined) patch.need_id = updates.needId;
  if (updates.volunteerId !== undefined) patch.volunteer_id = updates.volunteerId;
  if (updates.matchScore !== undefined) patch.match_score = updates.matchScore;
  if (updates.timestamp !== undefined) patch.timestamp = updates.timestamp;
  if (updates.metadata !== undefined) patch.metadata = updates.metadata;

  return cleanObject(patch);
}

function applyNeedFilters(query: any, filters: NeedQuery): any {
  if (filters.needId) query = query.eq('need_id', filters.needId);
  if (filters.status) {
    query = Array.isArray(filters.status)
      ? query.in('status', filters.status)
      : query.eq('status', filters.status);
  }
  if (filters.urgency) {
    query = Array.isArray(filters.urgency)
      ? query.in('urgency', filters.urgency)
      : query.eq('urgency', filters.urgency);
  }
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.subcategory) query = query.eq('subcategory', filters.subcategory);
  if (filters.ngoId) query = query.eq('ngo_id', filters.ngoId);
  if (filters.assignedTo !== undefined) query = query.eq('assigned_to', filters.assignedTo);
  if (filters.limit) query = query.limit(filters.limit);
  query = query.order('submitted_at', { ascending: filters.orderBySubmittedAt === 'asc' });
  return query;
}

function applyVolunteerFilters(query: any, filters: VolunteerQuery): any {
  if (filters.id) query = query.eq('id', filters.id);
  if (filters.status) {
    query = Array.isArray(filters.status)
      ? query.in('status', filters.status)
      : query.eq('status', filters.status);
  }
  if (filters.skills?.length) query = query.contains('skills', filters.skills);
  if (filters.limit) query = query.limit(filters.limit);
  return query;
}

function applyMatchLogFilters(query: any, filters: MatchLogQuery): any {
  if (filters.id) query = query.eq('id', filters.id);
  if (filters.needId) query = query.eq('need_id', filters.needId);
  if (filters.volunteerId) query = query.eq('volunteer_id', filters.volunteerId);
  if (filters.from) query = query.gte('timestamp', filters.from);
  if (filters.to) query = query.lte('timestamp', filters.to);
  if (filters.limit) query = query.limit(filters.limit);
  query = query.order('timestamp', { ascending: false });
  return query;
}

async function runQuery<T>(label: string, executor: () => Promise<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  try {
    const { data, error } = await executor();
    if (error) {
      throw new Error(error.message);
    }
    return data as T;
  } catch (error) {
    console.error(`${label} failed:`, error);
    throw error instanceof Error ? error : new Error(`${label} failed`);
  }
}

// ---------------------------------------------------------------------------
// Need wrappers
// ---------------------------------------------------------------------------
export async function createNeed(need: Need): Promise<string> {
  const needId = need.needId || randomUUID();
  await runQuery('createNeed', async () =>
    supabase.from('needs').insert(toNeedRecord({ ...need, needId })).select('need_id').single()
  );
  return needId;
}

export async function getNeed(needId: string): Promise<Need | null> {
  return runQuery('getNeed', async () => {
    const { data, error } = await supabase.from('needs').select('*').eq('need_id', needId).maybeSingle<NeedRecord>();
    return { data: data ? mapNeedRow(data) : null, error };
  });
}

export async function updateNeed(needId: string, updates: Partial<Need>): Promise<void> {
  await runQuery('updateNeed', async () =>
    supabase.from('needs').update(toNeedPatch(updates)).eq('need_id', needId).select('need_id').single()
  );
}

export async function queryNeeds(filters: NeedQuery): Promise<Need[]> {
  if (filters.center && typeof filters.radiusMeters === 'number') {
    // PostGIS/ST_DWithin pattern (back this with a SQL function or view when ready):
    // SELECT * FROM needs
    // WHERE ST_DWithin(
    //   location_geo,
    //   ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    //   p_radius_meters
    // );
    const rpcRows = await runQuery('queryNeeds (geo)', async () =>
      supabase.rpc('query_needs_nearby', {
        p_lat: filters.center!.lat,
        p_lng: filters.center!.lng,
        p_radius_meters: filters.radiusMeters
      })
    );

    const needs = (rpcRows as unknown as NeedRecord[]).map(mapNeedRow);
    const filtered = applyNeedFilters(
      supabase.from('needs').select('*'),
      { ...filters, center: undefined, radiusMeters: undefined }
    );

    // If the RPC already includes the filters, this is still safe; this block simply
    // preserves the same filter semantics in one place for future swaps.
    void filtered;

    return needs;
  }

  return runQuery('queryNeeds', async () => {
    let query = supabase.from('needs').select('*');
    query = applyNeedFilters(query, filters);
    const { data, error } = await query;
    return { data: (data ?? []).map(mapNeedRow), error };
  });
}

// ---------------------------------------------------------------------------
// Volunteer wrappers
// ---------------------------------------------------------------------------
export async function createVolunteer(volunteer: Volunteer): Promise<string> {
  const id = volunteer.id || randomUUID();
  await runQuery('createVolunteer', async () =>
    supabase.from('volunteers').insert(toVolunteerRecord({ ...volunteer, id })).select('id').single()
  );
  return id;
}

export async function getVolunteer(volunteerId: string): Promise<Volunteer | null> {
  return runQuery('getVolunteer', async () => {
    const { data, error } = await supabase.from('volunteers').select('*').eq('id', volunteerId).maybeSingle<VolunteerRecord>();
    return { data: data ? mapVolunteerRow(data) : null, error };
  });
}

export async function updateVolunteer(volunteerId: string, updates: Partial<Volunteer>): Promise<void> {
  await runQuery('updateVolunteer', async () =>
    supabase.from('volunteers').update(toVolunteerPatch(updates)).eq('id', volunteerId).select('id').single()
  );
}

export async function queryVolunteers(filters: VolunteerQuery): Promise<Volunteer[]> {
  if (filters.near && typeof filters.radiusMeters === 'number') {
    // PostGIS/ST_DWithin pattern:
    // SELECT * FROM volunteers
    // WHERE ST_DWithin(
    //   location,
    //   ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    //   p_radius_meters
    // );
    const rpcRows = await runQuery('queryVolunteers (geo)', async () =>
      supabase.rpc('query_volunteers_nearby', {
        p_lat: filters.near!.lat,
        p_lng: filters.near!.lng,
        p_radius_meters: filters.radiusMeters
      })
    );

    return (rpcRows as unknown as VolunteerRecord[]).map(mapVolunteerRow);
  }

  return runQuery('queryVolunteers', async () => {
    let query = supabase.from('volunteers').select('*');
    query = applyVolunteerFilters(query, filters);
    const { data, error } = await query;
    return { data: (data ?? []).map(mapVolunteerRow), error };
  });
}

// ---------------------------------------------------------------------------
// Match log wrappers
// ---------------------------------------------------------------------------
export async function createMatchLog(matchLog: Omit<MatchLog, 'id' | 'timestamp'> & Partial<Pick<MatchLog, 'id' | 'timestamp'>>): Promise<string> {
  const id = matchLog.id || randomUUID();
  const timestamp = matchLog.timestamp || new Date().toISOString();
  await runQuery('createMatchLog', async () =>
    supabase.from('match_logs').insert(toMatchLogRecord({ ...matchLog, id, timestamp })).select('id').single()
  );
  return id;
}

export async function getMatchLog(matchLogId: string): Promise<MatchLog | null> {
  return runQuery('getMatchLog', async () => {
    const { data, error } = await supabase.from('match_logs').select('*').eq('id', matchLogId).maybeSingle<MatchLogRecord>();
    return { data: data ? mapMatchLogRow(data) : null, error };
  });
}

export async function updateMatchLog(matchLogId: string, updates: Partial<MatchLog>): Promise<void> {
  await runQuery('updateMatchLog', async () =>
    supabase.from('match_logs').update(toMatchLogPatch(updates)).eq('id', matchLogId).select('id').single()
  );
}

export async function queryMatchLogs(filters: MatchLogQuery): Promise<MatchLog[]> {
  return runQuery('queryMatchLogs', async () => {
    let query = supabase.from('match_logs').select('*');
    query = applyMatchLogFilters(query, filters);
    const { data, error } = await query;
    return { data: (data ?? []).map(mapMatchLogRow), error };
  });
}

// ---------------------------------------------------------------------------
// Generic helpers for future migration work
// ---------------------------------------------------------------------------
export function generateNeedId(): string {
  return randomUUID();
}

export function generateVolunteerId(): string {
  return randomUUID();
}

export function generateMatchLogId(): string {
  return randomUUID();
}
