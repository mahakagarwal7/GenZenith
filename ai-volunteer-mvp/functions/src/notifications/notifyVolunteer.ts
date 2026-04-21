import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

type TwilioConfig = {
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
};

function getTwilioConfig(): TwilioConfig {
  const env = process.env;
  const runtimeConfig = typeof functions.config === 'function' ? functions.config() : {};

  return {
    accountSid: env.TWILIO_ACCOUNT_SID || env.TWILIO_SID || (runtimeConfig as any)?.twilio?.account_sid,
    authToken: env.TWILIO_AUTH_TOKEN || (runtimeConfig as any)?.twilio?.auth_token,
    fromNumber: env.TWILIO_PHONE_NUMBER || env.TWILIO_FROM_NUMBER || (runtimeConfig as any)?.twilio?.phone_number
  };
}

function getVolunteerPhone(volunteerData: Record<string, unknown>): string | null {
  const phone = volunteerData.phone || volunteerData.phoneNumber || volunteerData.contactNumber || volunteerData.mobile;

  return typeof phone === 'string' && phone.trim() ? phone.trim() : null;
}

export async function notifyVolunteer(volunteerId: string, needId: string): Promise<boolean> {
  try {
    const config = getTwilioConfig();
    if (!config.accountSid || !config.authToken || !config.fromNumber) {
      console.error('Twilio is not configured.');
      return false;
    }

    const volunteerSnap = await admin.firestore().collection('volunteers').doc(volunteerId).get();
    const volunteerData = volunteerSnap.data();
    if (!volunteerData) {
      return false;
    }

    const toNumber = getVolunteerPhone(volunteerData as Record<string, unknown>);
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