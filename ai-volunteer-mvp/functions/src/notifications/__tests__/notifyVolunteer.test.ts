// functions/src/notifications/__tests__/notifyVolunteer.test.ts

process.env.GCLOUD_PROJECT = 'test-project';
process.env.TWILIO_ACCOUNT_SID = 'AC123456789';
process.env.TWILIO_AUTH_TOKEN = 'auth-token';
process.env.TWILIO_PHONE_NUMBER = '+15550000000';

const mockGet = jest.fn().mockResolvedValue({
  data: () => ({
    phoneNumber: '+15551112222'
  })
});

jest.mock('firebase-admin', () => ({
  firestore: () => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockGet
      }))
    }))
  })
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
    mockGet.mockResolvedValueOnce({ data: () => ({}) });
    (globalThis as any).fetch = jest.fn();

    const result = await notifyVolunteer('vol-1', 'need-99');

    expect(result).toBe(false);
  });
});
