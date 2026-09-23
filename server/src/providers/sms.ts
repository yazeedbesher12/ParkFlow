import { env } from '../config/env';
export interface SmsProvider {sendOtp(phone:string,code:string):Promise<void>}
export const sms:SmsProvider={async sendOtp(phone,code){
 if(env.SMS_PROVIDER==='development') return;
 if(!env.SMS_API_URL||!env.SMS_API_KEY)throw new Error('SMS provider is not configured');
 const res=await fetch(env.SMS_API_URL,{method:'POST',headers:{Authorization:`Bearer ${env.SMS_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({phone,code}),signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw new Error('SMS provider rejected delivery');
}};
