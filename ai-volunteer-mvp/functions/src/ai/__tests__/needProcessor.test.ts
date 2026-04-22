// functions/src/ai/__tests__/needProcessor.test.ts

process.env.GCLOUD_PROJECT = 'test-project';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const mockNeedSingle = jest.fn().mockResolvedValue({
  data: {
    need_id: 'need-123',
    status: 'unassigned',
    location_geo: 'SRID=4326;POINT(77.59 12.97)'
  },
  error: null
});

const mockNeedSelect = jest.fn().mockReturnValue({
  eq: jest.fn().mockReturnValue({ maybeSingle: mockNeedSingle })
});

const mockNeedUpdate = jest.fn().mockResolvedValue({ data: null, error: null });
const mockMatchLogInsert = jest.fn().mockResolvedValue({ data: null, error: null });

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'needs') {
        return {
          select: mockNeedSelect,
          update: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) }))
        };
      }

      if (table === 'match_logs') {
        return {
          insert: mockMatchLogInsert
        };
      }

      return {};
    })
  }
}));

jest.mock('../../matching/intelligentMatchingService', () => ({
  matchVolunteers: jest.fn().mockResolvedValue([
    { volunteerId: 'vol-top', score: 0.85 },
    { volunteerId: 'vol-second', score: 0.72 }
  ])
}));

jest.mock('../../notifications/notifyVolunteer', () => ({
  notifyVolunteer: jest.fn().mockResolvedValue(true)
}));

import { onNeedCreated } from '../../triggers/needProcessor';
import { matchVolunteers } from '../../matching/intelligentMatchingService';
import { notifyVolunteer } from '../../notifications/notifyVolunteer';

describe('Need Processor Trigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips non-POST requests', async () => {
    const req = { method: 'GET', body: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn()
    };

    await onNeedCreated(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.send).toHaveBeenCalledWith('Method Not Allowed');
  });

  it('returns bad request when need id is missing', async () => {
    const req = { method: 'POST', body: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn()
    };

    await onNeedCreated(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing need id' }));
  });

  it('processes a valid need insert and updates status to pending_acceptance', async () => {
    const req = {
      method: 'POST',
      body: {
        type: 'INSERT',
        table: 'needs',
        record: { need_id: 'need-123' }
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn()
    };

    await onNeedCreated(req as any, res as any);

    expect(matchVolunteers).toHaveBeenCalledWith('need-123');
    expect(notifyVolunteer).toHaveBeenCalledWith('vol-top', 'need-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, needId: 'need-123' }));
  });

  it('skips needs flagged for validation', async () => {
    mockNeedSingle.mockResolvedValueOnce({
      data: {
        need_id: 'need-456',
        status: 'needs_validation',
        location_geo: null
      },
      error: null
    });

    const req = {
      method: 'POST',
      body: {
        type: 'INSERT',
        table: 'needs',
        record: { need_id: 'need-456' }
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn()
    };

    await onNeedCreated(req as any, res as any);

    expect(matchVolunteers).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, needId: 'need-456' }));
  });
});
