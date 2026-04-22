import { matchVolunteers } from '../matching/intelligentMatchingService';
import { notifyVolunteer } from '../notifications/notifyVolunteer';
import { supabase } from '../lib/supabaseClient';
import type { HttpRequest, HttpResponse } from '../lib/httpTypes';

type VolunteerResponse = 'YES' | 'NO';

type NeedRow = {
  need_id: string;
  status: string;
  assigned_to: string | null;
  location_geo: unknown | null;
};

async function loadNeed(needId: string): Promise<NeedRow | null> {
  const { data, error } = await supabase
    .from('needs')
    .select('need_id, status, assigned_to, location_geo')
    .eq('need_id', needId)
    .maybeSingle<NeedRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function assignNeed(needId: string, volunteerId: string): Promise<void> {
  const { error } = await supabase
    .from('needs')
    .update({
      assigned_to: volunteerId,
      status: 'assigned',
      updated_at: new Date().toISOString()
    })
    .eq('need_id', needId);

  if (error) {
    throw error;
  }
}

async function markNeedPending(needId: string, nextVolunteerId: string | null): Promise<void> {
  const { error } = await supabase
    .from('needs')
    .update({
      assigned_to: null,
      status: nextVolunteerId ? 'pending_acceptance' : 'unassigned',
      updated_at: new Date().toISOString()
    })
    .eq('need_id', needId);

  if (error) {
    throw error;
  }
}

export async function volunteerResponseWebhook(req: HttpRequest, res: HttpResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const { needId, volunteerId, response } = (req.body || {}) as Record<string, string | undefined>;
  const normalizedResponse = String(response || '').trim().toUpperCase() as VolunteerResponse;

  if (!needId || !volunteerId || (normalizedResponse !== 'YES' && normalizedResponse !== 'NO')) {
    res.status(400).json({ error: 'Missing or invalid payload' });
    return;
  }

  try {
    let nextVolunteerId: string | null = null;
    const need = await loadNeed(String(needId));

    if (!need) {
      res.status(404).json({ error: 'Need not found' });
      return;
    }

    if (normalizedResponse === 'YES') {
      await assignNeed(String(needId), volunteerId);
    } else {
      const matches = await matchVolunteers(String(needId), 10, [volunteerId]);
      nextVolunteerId = matches[0]?.volunteerId || null;
      await markNeedPending(String(needId), nextVolunteerId);
    }

    if (normalizedResponse === 'NO' && nextVolunteerId) {
      await notifyVolunteer(nextVolunteerId, String(needId));
    }

    res.status(200).json({
      ok: true,
      needId,
      volunteerId,
      response: normalizedResponse,
      status: normalizedResponse === 'YES' ? 'assigned' : nextVolunteerId ? 'pending_acceptance' : 'unassigned',
      nextVolunteerId
    });
  } catch (error) {
    console.error('Volunteer response webhook failed:', error);
    res.status(500).json({ error: 'Failed to process response' });
  }
  }
