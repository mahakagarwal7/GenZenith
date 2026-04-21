import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { notifyVolunteer } from '../notifications/notifyVolunteer';

if (!admin.apps.length) {
  admin.initializeApp();
}

type VolunteerResponse = 'YES' | 'NO';

export const volunteerResponseWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const { needId, volunteerId, response } = req.body || {};
  const normalizedResponse = String(response || '').trim().toUpperCase() as VolunteerResponse;

  if (!needId || !volunteerId || (normalizedResponse !== 'YES' && normalizedResponse !== 'NO')) {
    res.status(400).json({ error: 'Missing or invalid payload' });
    return;
  }

  const needRef = admin.firestore().collection('needs_raw').doc(String(needId));

  try {
    let nextVolunteerId: string | null = null;

    await admin.firestore().runTransaction(async (tx) => {
      const needSnap = await tx.get(needRef);
      if (!needSnap.exists) {
        throw new Error('NEED_NOT_FOUND');
      }

      const needData = (needSnap.data() || {}) as Record<string, any>;
      const matchedVolunteers = Array.isArray(needData.matchedVolunteers) ? needData.matchedVolunteers : [];

      if (normalizedResponse === 'YES') {
        tx.update(needRef, {
          assignedTo: volunteerId,
          status: 'assigned',
          acceptedBy: volunteerId,
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }

      const remainingMatches = matchedVolunteers.filter(
        (match: any) => match?.volunteerId && match.volunteerId !== volunteerId
      );
      nextVolunteerId = remainingMatches[0]?.volunteerId || null;

      tx.update(needRef, {
        matchedVolunteers: remainingMatches,
        status: nextVolunteerId ? 'pending_acceptance' : 'unassigned',
        assignedTo: null,
        nextVolunteerId,
        declinedBy: admin.firestore.FieldValue.arrayUnion(volunteerId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

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
    if (error instanceof Error && error.message === 'NEED_NOT_FOUND') {
      res.status(404).json({ error: 'Need not found' });
      return;
    }

    console.error('Volunteer response webhook failed:', error);
    res.status(500).json({ error: 'Failed to process response' });
  }
});
