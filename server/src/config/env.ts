import 'dotenv/config';
import { z } from 'zod';
const optional = z.string().optional();
export const env = z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'), PORT:z.coerce.number().default(4000),
 DATABASE_URL:z.string().min(1), REDIS_URL:z.string().url(),
 JWT_ACCESS_SECRET:z.string().min(32), JWT_REFRESH_SECRET:z.string().min(32),
 ACCESS_TOKEN_TTL:z.coerce.number().int().positive().default(900), REFRESH_TOKEN_TTL:z.coerce.number().int().positive().default(2592000),
 CORS_ORIGINS:z.string().default('http://localhost:8081'), OSRM_BASE_URL:z.string().url().default('https://router.project-osrm.org'),
 SMS_PROVIDER:z.enum(['development','http']).default('development'), SMS_API_URL:optional, SMS_API_KEY:optional,
 PAYMENT_PROVIDER:z.enum(['development','http']).default('development'), PAYMENT_API_URL:optional, PAYMENT_API_KEY:optional,
 PAYMENT_WEBHOOK_SECRET:z.string().min(32),
 S3_ENDPOINT:z.string().url(), S3_REGION:z.string().default('us-east-1'), S3_BUCKET:z.string(), S3_ACCESS_KEY:z.string(), S3_SECRET_KEY:z.string(),
 FIREBASE_PROJECT_ID:optional,FIREBASE_CLIENT_EMAIL:optional,FIREBASE_PRIVATE_KEY:optional,EXPO_PUSH_ACCESS_TOKEN:optional,
}).parse(process.env);
if(env.NODE_ENV==='production') {
 if(env.SMS_PROVIDER==='development'||env.PAYMENT_PROVIDER==='development') throw new Error('Production requires configured SMS and payment providers');
 for(const name of ['SMS_API_URL','SMS_API_KEY','PAYMENT_API_URL','PAYMENT_API_KEY'] as const) if(!env[name]) throw new Error(`${name} is required`);
 if([env.JWT_ACCESS_SECRET,env.JWT_REFRESH_SECRET,env.PAYMENT_WEBHOOK_SECRET].some(s=>s.startsWith('replace-'))) throw new Error('Replace example secrets');
 if(!env.SMS_API_URL?.startsWith('https://')||!env.PAYMENT_API_URL?.startsWith('https://')) throw new Error('Provider URLs must use HTTPS');
}
export const origins = env.CORS_ORIGINS.split(',').map(s=>s.trim());
