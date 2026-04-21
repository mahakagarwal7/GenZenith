// functions/src/ai/__tests__/handleWhatsAppWebhook.test.ts

// Set env vars BEFORE any imports
process.env.GCLOUD_PROJECT = 'test-project';

// Create FieldValue mock ONCE - this is the KEY fix
const mockFieldValue = {
  serverTimestamp: jest.fn(() => ({ _methodName: 'FieldValue.serverTimestamp' })),
  arrayUnion: jest.fn((...args: any[]) => ({ _methodName: 'FieldValue.arrayUnion', args })),
  arrayRemove: jest.fn((...args: any[]) => ({ _methodName: 'FieldValue.arrayRemove', args })),
  increment: jest.fn((n: number) => ({ _methodName: 'FieldValue.increment', value: n })),
  delete: jest.fn(() => ({ _methodName: 'FieldValue.delete' }))
};

let mockSet: jest.Mock;

// Mock firebase-admin - MUST match exact export structure
jest.mock('firebase-admin', () => {
  mockSet = jest.fn().mockResolvedValue(undefined);
  
  const mockFieldValue = {
    serverTimestamp: jest.fn(() => ({ _methodName: 'FieldValue.serverTimestamp' })),
    arrayUnion: jest.fn((...args: any[]) => ({ _methodName: 'FieldValue.arrayUnion', args })),
    arrayRemove: jest.fn((...args: any[]) => ({ _methodName: 'FieldValue.arrayRemove', args })),
    increment: jest.fn((n: number) => ({ _methodName: 'FieldValue.increment', value: n })),
    delete: jest.fn(() => ({ _methodName: 'FieldValue.delete' }))
  };
  
  const firestoreFn = jest.fn(() => ({
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnValue({
      id: 'test-need-id',
      set: mockSet
    }),
    FieldValue: mockFieldValue
  })) as any;
  
  // Assign FieldValue as static property on the firestore function
  firestoreFn.FieldValue = mockFieldValue;
  
  return {
    initializeApp: jest.fn(),
    firestore: firestoreFn,
    FieldValue: mockFieldValue
  };
});

// Mock AI modules
jest.mock('../../ai/processOCR', () => ({
  extractTextFromImage: jest.fn().mockResolvedValue({ 
    text: 'Urgent water needed', 
    confidence: 0.9 
  })
}));

jest.mock('../../ai/messageClassifier', () => ({
  classifyMessage: jest.fn().mockReturnValue({
    category: 'water_supply',
    classification: 'urgent',
    confidence: 0.9,
    routing: { 
      immediate_action: false, 
      notification_targets: ['standard_queue'], 
      sla_minutes: 30 
    },
    duplicate_check: { is_duplicate: false, similar_requests: [] }
  })
}));

jest.mock('../../location/geocodeService', () => ({
  geocodeLocation: jest.fn().mockResolvedValue({ lat: 12.9716, lng: 77.5946 })
}));

// NOW import AFTER all mocks
import { handleWhatsAppWebhook } from '../../ingestion/handleWhatsAppWebhook';
import { geocodeLocation } from '../../location/geocodeService';

describe('WhatsApp Webhook Handler', () => {
  let req: any, res: any;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { method: 'POST', body: {} };
    res = { 
      status: jest.fn().mockReturnThis(), 
      json: jest.fn(),
      send: jest.fn()
    };
  });

  it('rejects non-POST requests', async () => {
    req.method = 'GET';
    await handleWhatsAppWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.send).toHaveBeenCalledWith('Method Not Allowed');
  });

  it('rejects missing payload', async () => {
    req.body = {};
    await handleWhatsAppWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Missing payload') })
    );
  });

  it('processes text-only message successfully', async () => {
    req.body = { Body: 'Emergency medical help needed near Central Park', From: '+1234567890' };
    await handleWhatsAppWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ 
        status: 'ok',
        needId: 'test-need-id'
      })
    );
    expect(geocodeLocation).toHaveBeenCalledWith('Central Park');
  });

  it('handles image messages with OCR', async () => {
    req.body = { MediaUrl0: 'gs://bucket/image.png', From: '+1234567890' };
    await handleWhatsAppWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
  });

  it('marks needs_validation when geocoding fails', async () => {
    (geocodeLocation as jest.Mock).mockResolvedValueOnce(null);
    req.body = { Body: 'Need water at some unknown place', From: '+1234567890' };

    await handleWhatsAppWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      location: {
        geo: null,
        text: 'some unknown place'
      },
      status: 'needs_validation'
    }));
  });
});