// functions/src/ai/__tests__/needProcessor.test.ts

// Set env vars BEFORE any imports
process.env.GCLOUD_PROJECT = 'test-project';

// Mock firebase-admin with COMPLETE structure
jest.mock('firebase-admin', () => {
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockAdd = jest.fn().mockResolvedValue({ id: 'log-id' });
  
  const mockFieldValue = {
    serverTimestamp: jest.fn(() => ({ _methodName: 'FieldValue.serverTimestamp' })),
    arrayUnion: jest.fn((...args: any[]) => ({ _methodName: 'FieldValue.arrayUnion', args })),
    arrayRemove: jest.fn((...args: any[]) => ({ _methodName: 'FieldValue.arrayRemove', args })),
    increment: jest.fn((n: number) => ({ _methodName: 'FieldValue.increment', value: n })),
    delete: jest.fn(() => ({ _methodName: 'FieldValue.delete' }))
  };
  
  const firestoreFn = jest.fn(() => ({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ 
            status: 'unassigned', 
            location: { geo: { lat: 12.97, lng: 77.59 } },
            category: 'medical'
          })
        }),
        update: mockUpdate,
        id: 'test-need-id'
      }),
      add: mockAdd
    }),
    FieldValue: mockFieldValue
  })) as any;
  
  // Add FieldValue as static property
  firestoreFn.FieldValue = mockFieldValue;
  
  return {
    initializeApp: jest.fn(),
    firestore: firestoreFn,
    FieldValue: mockFieldValue
  };
});

// Mock firebase-functions
jest.mock('firebase-functions', () => ({
  https: {
    onRequest: (fn: any) => fn
  },
  firestore: {
    document: () => ({
      onCreate: (fn: any) => fn
    })
  }
}));

// Mock matching service
jest.mock('../../matching/intelligentMatchingService', () => ({
  matchVolunteers: jest.fn().mockResolvedValue([
    { volunteerId: 'vol-top', score: 0.85 },
    { volunteerId: 'vol-second', score: 0.72 }
  ])
}));

// NOW import AFTER mocks
import { onNeedCreated } from '../../triggers/needProcessor';

describe('Need Processor Trigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips needs flagged for manual validation', async () => {
    // 👇 snapshot.data() must be a METHOD returning object with status
    const mockSnap = {
      data: () => ({ status: 'needs_validation' }),
      ref: { update: jest.fn() },
      id: 'test-need-id'
    };
    
    const context = { 
      params: { needId: 'test-need' },
      resource: { name: 'projects/test/databases/(default)/documents/needs_raw/test-need' }
    };
    
    await onNeedCreated(mockSnap as any, context as any);
    
    expect(mockSnap.ref.update).not.toHaveBeenCalled();
  });

  it('runs matching and updates document for valid needs', async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    
    const mockSnap = {
      data: () => ({ 
        status: 'unassigned', 
        location: { geo: { lat: 12.97, lng: 77.59 } },
        category: 'medical'
      }),
      ref: { update: mockUpdate },
      id: 'test-need-id'
    };
    
    const context = { 
      params: { needId: 'test-need' },
      resource: { name: 'projects/test/databases/(default)/documents/needs_raw/test-need' }
    };
    
    await onNeedCreated(mockSnap as any, context as any);
    
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        matchedVolunteers: expect.arrayContaining([
          expect.objectContaining({ volunteerId: 'vol-top' })
        ]),
        status: 'unassigned'
      })
    );
  });
});