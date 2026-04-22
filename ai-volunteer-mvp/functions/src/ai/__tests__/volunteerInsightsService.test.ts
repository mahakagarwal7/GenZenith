jest.mock('../../lib/supabaseClient', () => ({
  getVolunteer: jest.fn().mockResolvedValue({
    id: 'vol-1',
    location: { lat: 12.97, lng: 77.59 },
    skills: ['logistics'],
    status: 'available',
    historicalResponseRate: 0.5,
    typicalCapacity: 2,
    totalAssignments: 2,
    activeTasks: 0,
    lastActiveHour: 18
  })
}));
import { analyzeVolunteer } from '../../insights/volunteerInsightsService';
describe('Volunteer Insights', () => {
  it('flags at-risk volunteers with low assignment history', async () => {
    const res = await analyzeVolunteer('vol-1');
    expect(res.engagement_health).toBe('at_risk');
    expect(res.skill_recommendations).toHaveLength(1);
  });
});