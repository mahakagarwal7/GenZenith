jest.mock('firebase-admin', () => ({
  firestore: () => ({ collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ skills: ['logistics'], totalAssignments: 2 }) }) }) }) })
}));
import { analyzeVolunteer } from '../../insights/volunteerInsightsService';
describe('Volunteer Insights', () => {
  it('flags at-risk volunteers with low assignment history', async () => {
    const res = await analyzeVolunteer('vol-1');
    expect(res.engagement_health).toBe('at_risk');
    expect(res.skill_recommendations).toHaveLength(1);
  });
});