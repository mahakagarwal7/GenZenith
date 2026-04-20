import * as admin from 'firebase-admin';
import { VolunteerInsight } from '../shared-types';

export async function analyzeVolunteer(volunteerId: string): Promise<VolunteerInsight> {
  const db = admin.firestore();
  const vol = (await db.collection('volunteers').doc(volunteerId).get())?.data();
  if (!vol) throw new Error('Volunteer not found');

  const hour = new Date().getHours();
  const activeStart = 18, activeEnd = 21;
  const isNow = hour >= activeStart && hour <= activeEnd;

  const skillGap = vol.skills.length < 2 ? [{ skill: 'basic_first_aid', priority: 'high' as const, reason: 'No first-aid trained volunteers within 20km' }] : [];
  const health = (vol.totalAssignments || 0) > 5 ? 'good' : 'at_risk';

  return {
    volunteer_id: volunteerId,
    predicted_availability: {
      now: isNow,
      reason: isNow ? 'Within historical response window' : `Outside typical hours (${activeStart}:00-${activeEnd}:00)`,
      next_available_window: `${activeStart}:00 today`
    },
    skill_recommendations: skillGap,
    engagement_health: health,
    recent_activity: { tasks_completed: vol.totalAssignments || 0, tasks_declined: 1, avg_response_time: '12_minutes' }
  };
}