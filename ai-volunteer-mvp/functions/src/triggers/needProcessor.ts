import { matchVolunteers } from '../matching/intelligentMatchingService';
import { notifyVolunteer } from '../notifications/notifyVolunteer';
import { supabase } from '../lib/supabaseClient';
import type { HttpRequest, HttpResponse } from '../lib/httpTypes';
import type { NeedRecord } from '../lib/supabaseClient';

/*
  Supabase trigger approach selected for MVP:
  - Database Webhook calls this HTTPS function when a row is inserted into needs.
  - This is more reliable than client-side Realtime for server-side workflows.
  - Realtime remains better for UI updates, but the actual matching workflow
    is easier to keep deterministic with a webhook/Edge Function entrypoint.

  Local testing note:
  - Realtime can be tested by inserting rows through the local Supabase stack.
  - Webhook behavior can be tested by posting the same JSON payload to this endpoint.
  - Use `supabase start` locally and point the database webhook to the local URL.
*/

function extractNeedId(payload: any): string | null {
  return payload?.record?.need_id
    || payload?.record?.needId
    || payload?.need_id
    || payload?.needId
    || payload?.id
    || null;
}

async function loadNeedForMatching(needId: string): Promise<NeedRecord | null> {
  const { data, error } = await supabase
    .from('needs')
    .select('*')
    .eq('need_id', needId)
    .maybeSingle<NeedRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function markNeedPendingAcceptance(needId: string, matches: any[]): Promise<void> {
  const { error } = await supabase
    .from('needs')
    .update({
      status: 'pending_acceptance',
      updated_at: new Date().toISOString()
    })
    .eq('need_id', needId);

  if (error) {
    throw error;
  }
}

async function insertMatchLog(needId: string, matches: any[]): Promise<void> {
  const { error } = await supabase.from('match_logs').insert({
    need_id: needId,
    volunteer_id: matches[0]?.volunteerId || null,
    match_score: matches[0]?.score || 0,
    timestamp: new Date().toISOString(),
    metadata: {
      source: 'needProcessor',
      matchedCount: matches.length
    }
  });

  if (error) {
    throw error;
  }
}

async function processNeedInsert(needId: string): Promise<void> {
  const need = await loadNeedForMatching(needId);
  if (!need) {
    console.error('Matching trigger failed:', `Need not found for id ${needId}`);
    return;
  }

  if (need.status === 'needs_validation' || !need.location_geo) {
    console.error('Matching trigger skipped:', `Need ${needId} is not ready for matching`);
    return;
  }

  try {
    // Matching logic remains unchanged.
    const matches = await matchVolunteers(needId);
    const topMatches = matches.slice(0, 3);

    await markNeedPendingAcceptance(needId, matches);

    await Promise.allSettled(topMatches.map(match => notifyVolunteer(match.volunteerId, needId)));

    await insertMatchLog(needId, matches);
  } catch (err) {
    console.error('Matching trigger failed:', err);
  }
}

/**
 * Supabase Database Webhook / Edge Function compatible entrypoint.
 *
 * Expected payload shape from Supabase database webhook:
 * {
 *   "type": "INSERT",
 *   "table": "needs",
 *   "record": { ... }
 * }
 */
export async function onNeedCreated(req: HttpRequest, res: HttpResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const needId = extractNeedId(req.body);
    if (!needId) {
      res.status(400).json({ error: 'Missing need id' });
      return;
    }

    await processNeedInsert(needId);

    res.status(200).json({ ok: true, needId });
  } catch (error) {
    console.error('Matching trigger failed:', error);
    res.status(500).json({ error: 'Failed to process need' });
  }
}
