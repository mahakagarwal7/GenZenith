import { getVolunteer } from '../lib/supabaseClient';

type TwilioConfig = {
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
};

function getTwilioConfig(): TwilioConfig {
  const env = process.env;

  return {
    accountSid: env.TWILIO_ACCOUNT_SID || env.TWILIO_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    fromNumber: env.TWILIO_PHONE_NUMBER || env.TWILIO_FROM_NUMBER
  };
}

export async function notifyVolunteer(volunteerId: string, needId: string): Promise<boolean> {
  try {
    const config = getTwilioConfig();
    if (!config.accountSid || !config.authToken || !config.fromNumber) {
      console.error('Twilio is not configured.');
      return false;
    }

    const volunteer = await getVolunteer(volunteerId);
    if (!volunteer) {
      return false;
    }

    const toNumber = volunteer.contactNumber ?? null;
    if (!toNumber) {
      console.error(`No phone number found for volunteer ${volunteerId}`);
      return false;
    }

    const body = new URLSearchParams({
      To: toNumber,
      From: config.fromNumber,
      Body: `You have a new task. Reply YES to accept. Need ID: ${needId}`
    });

    const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      console.error(`Twilio SMS send failed with status ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to notify volunteer:', error);
    return false;
  }
}