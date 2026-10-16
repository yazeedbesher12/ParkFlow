import { env } from '../config/env';

export type SmsDelivery = 'sms' | 'development';
export interface SmsProvider {
  sendOtp(to: string, code: string): Promise<SmsDelivery>;
}

export const smsProvider: SmsProvider = {
  async sendOtp(to, code) {
    if (env.SMS_PROVIDER === 'development') {
      if (env.NODE_ENV !== 'development') throw new Error('Development SMS is forbidden outside development');
      // Explicit local development only. Never returned by an API or written in production logs.
      process.stdout.write(`[ParkFlow development SMS] ${to}: ${code} (expires in 5 minutes; no SMS was sent)\n`);
      return 'development';
    }
    if (env.SMS_PROVIDER !== 'twilio' || !env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) {
      throw new Error('SMS provider is not configured');
    }
    // https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: `Your ParkFlow code is ${code}. Valid for 5 minutes. Do not share this code.` }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('SMS provider rejected the request');
    const message = await response.json() as { sid?: string; status?: string; error_code?: number | null };
    if (!message.sid || message.error_code || !['accepted', 'queued', 'sending', 'sent', 'delivered'].includes(message.status ?? '')) {
      throw new Error('SMS provider did not accept the message');
    }
    return 'sms';
  },
};
