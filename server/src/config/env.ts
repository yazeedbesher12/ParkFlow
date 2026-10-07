import 'dotenv/config';
import { z } from 'zod';
const optional = z.string().optional();
export const env = z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'), PORT:z.coerce.number().default(4000),
 DEV_SKIP_EMAIL_OTP:z.enum(['true','false']).default('false').transform(v=>v==='true'),
 DEV_SKIP_PHONE_OTP:z.enum(['true','false']).default('false').transform(v=>v==='true'),
 SMS_PROVIDER:z.enum(['disabled','development','twilio','twilio-verify']).default('disabled'),
 TWILIO_ACCOUNT_SID:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^AC[0-9a-fA-F]{32}$/).optional()), TWILIO_AUTH_TOKEN:optional, TWILIO_FROM:optional,
 TWILIO_VERIFY_SERVICE_SID:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^VA[0-9a-fA-F]{32}$/).optional()),
 PROFILE_ENCRYPTION_KEY:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^[a-fA-F0-9]{64}$/).optional()),
 DATABASE_URL:z.string().min(1), REDIS_URL:z.string().url(),
 JWT_ACCESS_SECRET:z.string().min(32), JWT_REFRESH_SECRET:z.string().min(32),
 ACCESS_TOKEN_TTL:z.coerce.number().int().positive().default(900), REFRESH_TOKEN_TTL:z.coerce.number().int().positive().default(2592000),
 CORS_ORIGINS:z.string().default('http://localhost:8081,http://127.0.0.1:8081'), OSRM_BASE_URL:z.string().url().default('https://router.project-osrm.org'),
 EMAIL_PROVIDER:z.enum(['smtp']).default('smtp'), EMAIL_FROM:z.email(),
 SMTP_HOST:z.string().min(1), SMTP_PORT:z.coerce.number().int().positive().default(465),
 SMTP_SECURE:z.enum(['true','false']).default('true').transform(v=>v==='true'), SMTP_USER:z.string().min(1), SMTP_PASSWORD:optional,
 PAYMENT_PROVIDER:z.enum(['development','http']).default('development'), PAYMENT_API_URL:optional, PAYMENT_API_KEY:optional,
 PAYMENT_WEBHOOK_SECRET:z.string().min(32),
 S3_ENDPOINT:z.string().url(), S3_REGION:z.string().default('us-east-1'), S3_BUCKET:z.string(), S3_ACCESS_KEY:z.string(), S3_SECRET_KEY:z.string(),
 FIREBASE_PROJECT_ID:optional,FIREBASE_CLIENT_EMAIL:optional,FIREBASE_PRIVATE_KEY:optional,EXPO_PUSH_ACCESS_TOKEN:optional,
}).parse(process.env);
if(env.NODE_ENV==='production'&&env.DEV_SKIP_PHONE_OTP) {
 throw new Error('DEV_SKIP_PHONE_OTP must be false in production');
}
if(env.NODE_ENV==='production'&&env.DEV_SKIP_EMAIL_OTP) {
 throw new Error('DEV_SKIP_EMAIL_OTP must be false in production');
}
if(env.NODE_ENV==='production') {
 if(env.SMS_PROVIDER==='development') throw new Error('Development SMS is forbidden in production');
 if(env.SMS_PROVIDER==='twilio'&&(!env.TWILIO_ACCOUNT_SID||!env.TWILIO_AUTH_TOKEN||!env.TWILIO_FROM)) throw new Error('Twilio SMS credentials are required');
 if(env.SMS_PROVIDER==='twilio-verify'&&(!env.TWILIO_ACCOUNT_SID||!env.TWILIO_AUTH_TOKEN||!env.TWILIO_VERIFY_SERVICE_SID)) throw new Error('Twilio Verify credentials and service SID are required');
 if(!env.PROFILE_ENCRYPTION_KEY) throw new Error('PROFILE_ENCRYPTION_KEY is required in production');
 if(!env.SMTP_PASSWORD) throw new Error('SMTP_PASSWORD is required');
 if(env.PAYMENT_PROVIDER==='development') throw new Error('Production requires configured payment provider');
 for(const name of ['PAYMENT_API_URL','PAYMENT_API_KEY'] as const) if(!env[name]) throw new Error(`${name} is required`);
 if([env.JWT_ACCESS_SECRET,env.JWT_REFRESH_SECRET,env.PAYMENT_WEBHOOK_SECRET].some(s=>s.startsWith('replace-'))) throw new Error('Replace example secrets');
 if(!env.PAYMENT_API_URL?.startsWith('https://')) throw new Error('Provider URLs must use HTTPS');
}
export const origins = env.CORS_ORIGINS.split(',').map(s=>s.trim());
