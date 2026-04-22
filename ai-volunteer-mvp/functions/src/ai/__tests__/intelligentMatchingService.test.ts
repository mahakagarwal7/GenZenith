// functions/src/ai/__tests__/intelligentMatchingService.test.ts

process.env.GCLOUD_PROJECT = 'test-project';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const mockNeedMaybeSingle = jest.fn().mockResolvedValue({
  data: {
    need_id: 'test-need-123',
    category: 'medical',
    location_geo: 'SRID=4326;POINT(77.5946 12.9716)',
    status: 'unassigned'
  },
  error: null
});

const mockNeedEq = jest.fn().mockReturnValue({ maybeSingle: mockNeedMaybeSingle });
const mockNeedSelect = jest.fn().mockReturnValue({ eq: mockNeedEq });

const mockRpc = jest.fn().mockResolvedValue({
  data: [
    {
      id: 'vol-perfect',
      location: 'SRID=4326;POINT(77.5900 12.9700)',
      skills: ['medical'],
      historical_response_rate: 0.95,
      typical_capacity: 3,
      total_assignments: 5,
      active_tasks: 0
    },
    {
      id: 'vol-far',
      location: 'SRID=4326;POINT(78.0000 13.5000)',
      skills: ['medical'],
      historical_response_rate: 0.4,
      typical_capacity: 3,
      total_assignments: 40,
      active_tasks: 2
    }
  ],
  error: null
});

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'needs') {
        return {
          select: mockNeedSelect
        };
      }

      return {};
    }),
    rpc: mockRpc
  }
}));

import { matchVolunteers } from '../../matching/intelligentMatchingService';

describe('Intelligent Matching Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns top 3 volunteers sorted by weighted score', async () => {
    const results = await matchVolunteers('test-need-123');

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(3);

    if (results.length > 0) {
      expect(results[0]).toHaveProperty('score');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('explanation');
      expect(results[0].explanation).toHaveProperty('proximity');
      expect(results[0].explanation).toHaveProperty('skill');
    }
  });

  it('scores proximity correctly (closer = higher)', async () => {
    const results = await matchVolunteers('test-need-123');
    const perfectVol = results.find((r: any) => r.volunteerId === 'vol-perfect');
    const farVol = results.find((r: any) => r.volunteerId === 'vol-far');

    if (perfectVol && farVol) {
      expect(perfectVol.explanation.proximity).toBeGreaterThan(farVol.explanation.proximity);
    }
  });
});
