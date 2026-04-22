// functions/src/notifications/__tests__/notifyVolunteer.test.ts

process.env.GCLOUD_PROJECT = 'test-project';
process.env.TWILIO_ACCOUNT_SID = 'AC123456789';
process.env.TWILIO_AUTH_TOKEN = 'auth-token';
process.env.TWILIO_PHONE_NUMBER = '+15550000000';

const mockGetVolunteer = jest.fn().mockResolvedValue({
  id: 'vol-1',
  location: { lat: 12.97, lng: 77.59 },
  skills: ['medical'],
  status: 'available',
  contactNumber: '+15551112222',
  historicalResponseRate: 0.9,
  typicalCapacity: 3,
  totalAssignments: 4,
  activeTasks: 0,
  lastActiveHour: 19
});

jest.mock('../../lib/supabaseClient', () => ({
  getVolunteer: mockGetVolunteer
}));

import { notifyVolunteer } from '../notifyVolunteer';

describe('notifyVolunteer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the SMS message to the volunteer phone number', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    (globalThis as any).fetch = fetchMock;

    const result = await notifyVolunteer('vol-1', 'need-99');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('https://api.twilio.com/2010-04-01/Accounts/AC123456789/Messages.json');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[0][1].body).toContain('To=%2B15551112222');
    expect(fetchMock.mock.calls[0][1].body).toContain('From=%2B15550000000');
    expect(fetchMock.mock.calls[0][1].body).toContain('Need+ID%3A+need-99');
  });

  it('returns false when no phone number exists', async () => {
    mockGetVolunteer.mockResolvedValueOnce(null);
    (globalThis as any).fetch = jest.fn();

    const result = await notifyVolunteer('vol-1', 'need-99');

    expect(result).toBe(false);
  });
});
