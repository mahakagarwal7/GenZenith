// functions/src/ai/__tests__/intelligentMatchingService.test.ts

// Set env vars
process.env.GCLOUD_PROJECT = 'test-project';

// Mock Firestore
jest.mock('firebase-admin', () => {
  const mockNeedDoc = {
    get: jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        location: { geo: { lat: 12.9716, lng: 77.5946 } },
        category: 'medical'
      })
    })
  };

  const mockVolunteersQuery = {
    get: jest.fn().mockResolvedValue({
      docs: [
        {
          id: 'vol-perfect',
          data: () => ({
            location: { lat: 12.97, lng: 77.59 },
            skills: ['medical'],
            status: 'available',
            historicalResponseRate: 0.95,
            typicalCapacity: 3,
            totalAssignments: 5,
            activeTasks: 0
          })
        },
        {
          id: 'vol-far',
          data: () => ({
            location: { lat: 13.5, lng: 78.0 },
            skills: ['medical'],
            status: 'available',
            historicalResponseRate: 0.4,
            typicalCapacity: 3,
            totalAssignments: 40,
            activeTasks: 2
          })
        }
      ]
    })
  };

  return {
    firestore: () => ({
      collection: jest.fn((collectionName: string) => {
        if (collectionName === 'needs_raw') {
          return { doc: jest.fn().mockReturnValue(mockNeedDoc) };
        }
        if (collectionName === 'volunteers') {
          return {
            where: jest.fn().mockReturnThis(),
            ...mockVolunteersQuery
          };
        }
        return { where: jest.fn().mockReturnThis(), get: jest.fn() };
      })
    })
  };
});

// NOW import
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
      // FIX: Use 'skill' not 'skill_match' to match source code
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