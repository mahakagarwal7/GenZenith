process.env.GCLOUD_PROJECT = 'test-project';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.TWILIO_ACCOUNT_SID = 'AC123456789';
process.env.TWILIO_AUTH_TOKEN = 'auth-token';
process.env.TWILIO_PHONE_NUMBER = '+15550000000';

const mockNeedSingle = jest.fn().mockResolvedValue({
  data: {
    need_id: 'need-123',
    status: 'pending_acceptance',
    assigned_to: null,
    location_geo: 'SRID=4326;POINT(77.59 12.97)'
  },
  error: null
});

const mockNeedSelect = jest.fn().mockReturnValue({
  eq: jest.fn().mockReturnValue({ maybeSingle: mockNeedSingle })
});

const mockNeedUpdate = jest.fn().mockResolvedValue({ data: null, error: null });
const mockNotifyVolunteer = jest.fn().mockResolvedValue(true);
const mockMatchVolunteers = jest.fn().mockResolvedValue([
  { volunteerId: 'vol-next', score: 0.81 },
  { volunteerId: 'vol-other', score: 0.72 }
]);

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'needs') {
        return {
          select: mockNeedSelect,
          update: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) }))
        };
      }

      return {};
    })
  }
}));

jest.mock('../../matching/intelligentMatchingService', () => ({
  matchVolunteers: mockMatchVolunteers
}));

jest.mock('../../notifications/notifyVolunteer', () => ({
  notifyVolunteer: mockNotifyVolunteer
}));

import { volunteerResponseWebhook } from '../volunteerResponseWebhook';

describe('volunteerResponseWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('assigns the need when a volunteer accepts', async () => {
    const req = {
      method: 'POST',
      body: { needId: 'need-123', volunteerId: 'vol-1', response: 'YES' }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn()
    };

    await volunteerResponseWebhook(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, status: 'assigned' }));
    expect(mockMatchVolunteers).not.toHaveBeenCalled();
    expect(mockNotifyVolunteer).not.toHaveBeenCalled();
  });

  it('routes the next volunteer when one declines', async () => {
    const req = {
      method: 'POST',
      body: { needId: 'need-123', volunteerId: 'vol-1', response: 'NO' }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn()
    };

    await volunteerResponseWebhook(req as any, res as any);

    expect(mockMatchVolunteers).toHaveBeenCalledWith('need-123', 10, ['vol-1']);
    expect(mockNotifyVolunteer).toHaveBeenCalledWith('vol-next', 'need-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, nextVolunteerId: 'vol-next' }));
  });
});