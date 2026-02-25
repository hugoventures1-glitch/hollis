import twilio from "twilio";

let twilioClient: twilio.Twilio | null = null;

export function getTwilioClient(): twilio.Twilio {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error(
        "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in environment variables"
      );
    }
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

export async function sendSMS(to: string, body: string): Promise<string> {
  const client = getTwilioClient();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    throw new Error("TWILIO_PHONE_NUMBER must be set in environment variables");
  }
  const message = await client.messages.create({ body, from: fromNumber, to });
  return message.sid;
}
