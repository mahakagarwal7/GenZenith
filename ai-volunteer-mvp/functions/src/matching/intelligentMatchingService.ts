import * as admin from 'firebase-admin';
import { Volunteer } from '../shared-types';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export async function matchVolunteers(needId: string, maxDistanceKm = 10): Promise<any[]> {
  const db = admin.firestore();
  const need = (await db.collection('needs_raw').doc(needId).get())?.data();
  if (!need?.location?.geo) throw new Error('Location unresolved');

  const vols = (await db.collection('volunteers').where('status', '==', 'available').get()).docs.map(d => ({ id: d.id, ...d.data() }) as Volunteer);
  const { lat: nLat, lng: nLng } = need.location.geo;

  return vols.map(v => {
    const dist = haversine(nLat, nLng, v.location.lat, v.location.lng);
    const proximity = Math.max(0, 1 - dist/maxDistanceKm);
    const skill = v.skills.includes(need.category) ? 1.0 : 0.3;
    const avail = v.historicalResponseRate;
    const workload = 1 - Math.min(1, v.activeTasks/v.typicalCapacity);
    const fairness = 1 - Math.min(1, v.totalAssignments/50);

    const score = 0.25*proximity + 0.25*skill + 0.20*avail + 0.15*workload + 0.15*fairness;
    return {
      volunteerId: v.id,
      score: Math.round(score*100)/100,
      explanation: { proximity: Math.round(proximity*100)/100, skill, availability: Math.round(avail*100)/100, workload: Math.round(workload*100)/100, fairness: Math.round(fairness*100)/100 }
    };
  }).sort((a,b) => b.score - a.score).slice(0,3);
}