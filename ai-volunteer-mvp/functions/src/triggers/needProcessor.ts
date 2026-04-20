import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { matchVolunteers } from '../matching/intelligentMatchingService';

export const onNeedCreated = functions.firestore
  .document('needs_raw/{needId}')
  .onCreate(async (snap, context) => {
    const needId = context.params.needId;
    const data = snap.data();
    if (data.status === 'needs_validation') return;

    try {
      const matches = await matchVolunteers(needId);
      await snap.ref.update({
        matchedVolunteers: matches,
        status: 'unassigned',
        matchedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      admin.firestore().collection('match_logs').add({
        needId, timestamp: new Date(),
        topMatch: matches[0]?.volunteerId || null,
        matchScore: matches[0]?.score || 0
      });
    } catch (err) {
      console.error('Matching trigger failed:', err);
    }
  });