import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { redis } from '../src/database/redis';
import { db } from '../src/database/client';
import { digest } from '../src/modules/auth/service';
import { env } from '../src/config/env';

const app=createApp();
const phone='+970591234567';
const prefix=`otp:phone:${digest(phone)}:`;
const send=(body:object={phone,purpose:'register',fullName:'First User'})=>request(app).post('/api/v1/auth/phone/request-otp').send(body);
const verify=(challengeId:string,code:string)=>request(app).post('/api/v1/auth/phone/verify-otp').send({challengeId,code});
const clearCooldown=()=>redis.del(prefix+'cooldown');
beforeEach(async()=>{
 const tables=await db.$queryRaw<{tablename:string}[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
 await db.$executeRawUnsafe('TRUNCATE '+tables.map(t=>'"'+t.tablename.replace(/"/g,'""')+'"').join(',')+' CASCADE');
 await redis.flushdb();
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('phone authentication',()=>{
 it('fails closed when SMS delivery has not been configured',async()=>{
  const previous=(env as {SMS_PROVIDER?:string}).SMS_PROVIDER;
  try {
   (env as {SMS_PROVIDER?:string}).SMS_PROVIDER='disabled';
   const result=await send();
   expect(result.status).toBe(503);
   expect(result.body.error.code).toBe('SMS_DELIVERY_FAILED');
  } finally {(env as {SMS_PROVIDER?:string}).SMS_PROVIDER=previous;}
 });
});

describe('phone challenge safeguards',()=>{
 let provider:typeof import('../src/providers/sms')['smsProvider'];
 const sentCode=()=>vi.mocked(provider.sendOtp).mock.calls.at(-1)![1];
 beforeEach(async()=>{provider=(await import('../src/providers/sms.js')).smsProvider;vi.spyOn(provider,'sendOtp').mockResolvedValue('sms');});

 it('creates a user and wallet only after verification, without exposing the code',async()=>{
  const challenge=await send({phone:'059 123-4567',purpose:'register',fullName:' First User '});
  expect(challenge.status).toBe(200);
  expect(challenge.body).toMatchObject({phone,resendAfterSeconds:60,delivery:'sms'});
  expect(challenge.body).not.toHaveProperty('code');
  expect(challenge.body).not.toHaveProperty('devCode');
  expect(sentCode()).toMatch(/^\d{6}$/);
  expect(await db.user.count()).toBe(0);
  const state=await redis.hgetall('otp:phone:challenge:'+challenge.body.challengeId);
  expect(JSON.stringify(state)).not.toContain(sentCode());
  const result=await verify(challenge.body.challengeId,sentCode());
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({isNewUser:true,user:{phone,fullName:'First User',role:'USER',profileCompletedAt:null}});
  expect(result.body.user.phoneVerifiedAt).toBeTruthy();
  expect(result.body.user).not.toHaveProperty('nationalIdEncrypted');
  expect(await db.wallet.count({where:{userId:result.body.user.id}})).toBe(1);
  expect((await request(app).get('/api/v1/auth/me').auth(result.body.session.accessToken,{type:'bearer'})).status).toBe(200);
 });
 it('uses one identity and resend budget for Palestinian dialing aliases',async()=>{
  const first=await send({phone:'٠٥٩١٢٣٤٥٦٧',purpose:'register',fullName:'First User'});
  expect(first.status).toBe(200);expect(first.body.phone).toBe(phone);
  for(const value of ['+972591234567','00970591234567','591234567']) {
   const again=await send({phone:value,purpose:'register',fullName:'Different Name'});
   expect(again.status).toBe(429);expect(again.body.error.code).toBe('OTP_COOLDOWN');
  }
 });
 it('rejects missing registration name and malformed or unsupported phone numbers',async()=>{
  for(const body of [{phone,purpose:'register'},{phone,purpose:'register',fullName:' '},{phone:'05912',purpose:'login'},{phone:'+970001234567',purpose:'login'},{phone:'+442071234567',purpose:'login'},{phone,purpose:'login',role:'ADMIN'}]) expect((await send(body)).status).toBe(400);
  expect(await redis.keys('otp:phone:challenge:*')).toHaveLength(0);
 });
 it('atomically consumes a challenge only once during simultaneous successful verification',async()=>{
  const c=await send(),code=sentCode();
  const results=await Promise.all([verify(c.body.challengeId,code),verify(c.body.challengeId,code)]);
  expect(results.map(r=>r.status).sort()).toEqual([200,401]);
  expect(await db.user.count()).toBe(1);expect(await db.refreshToken.count()).toBe(1);
  expect((await verify(c.body.challengeId,code)).status).toBe(401);
 });
 it('replaces the previous challenge on resend',async()=>{
  const first=await send(),oldCode=sentCode();await clearCooldown();
  const second=await send(),newCode=sentCode();
  expect(second.status).toBe(200);
  expect((await verify(first.body.challengeId,oldCode)).status).toBe(401);
  expect((await verify(second.body.challengeId,newCode)).status).toBe(200);
 });
 it('allows only one concurrent send for a phone',async()=>{
  const results=await Promise.all([send(),send(),send()]);
  expect(results.map(r=>r.status).sort()).toEqual([200,429,429]);
  expect(await redis.keys('otp:phone:challenge:*')).toHaveLength(1);
 });
 it('keeps failed attempts across resends and locks the phone for fifteen minutes',async()=>{
  const first=await send();const wrong=sentCode()==='000000'?'111111':'000000';
  for(let i=0;i<3;i++)expect((await verify(first.body.challengeId,wrong)).status).toBe(401);
  await clearCooldown();const second=await send();const current=sentCode(),wrong2=current==='000000'?'111111':'000000';
  expect((await verify(second.body.challengeId,wrong2)).status).toBe(401);
  const locked=await verify(second.body.challengeId,wrong2);
  expect(locked.status).toBe(429);expect(locked.body.error).toMatchObject({code:'OTP_LOCKED',details:{retryAfterSeconds:900}});
  expect((await verify(second.body.challengeId,current)).status).not.toBe(200);
  await clearCooldown();expect((await send()).body.error.code).toBe('OTP_LOCKED');
  expect(await redis.ttl(prefix+'lock')).toBeGreaterThan(895);
  await redis.del(prefix+'lock');const fresh=await send();expect(fresh.status).toBe(200);
  expect((await verify(fresh.body.challengeId,sentCode())).status).toBe(200);
 });
 it('expires codes and never authenticates an expired challenge',async()=>{
  const c=await send(),code=sentCode();
  expect(await redis.ttl('otp:phone:challenge:'+c.body.challengeId)).toBeGreaterThan(295);
  await redis.del('otp:phone:challenge:'+c.body.challengeId);
  expect((await verify(c.body.challengeId,code)).body.error.code).toBe('OTP_EXPIRED');
  expect(await db.user.count()).toBe(0);
 });
 it('counts concurrent incorrect guesses atomically',async()=>{
  const c=await send(),code=sentCode(),wrong=code==='000000'?'111111':'000000';
  const attempts=await Promise.all(Array.from({length:5},()=>verify(c.body.challengeId,wrong)));
  expect(attempts.map(r=>r.body.error.code).sort()).toEqual(['OTP_INVALID','OTP_INVALID','OTP_INVALID','OTP_INVALID','OTP_LOCKED']);
  expect((await verify(c.body.challengeId,code)).status).not.toBe(200);
  expect(await db.user.count()).toBe(0);
 });
 it('limits sends to five per hour and ten per day even after cooldown expires',async()=>{
  for(let i=0;i<5;i++){expect((await send()).status).toBe(200);await clearCooldown();}
  expect((await send()).body.error.code).toBe('OTP_SEND_LIMIT');
  await redis.del(prefix+'hour');
  for(let i=0;i<5;i++){await redis.del(...await redis.keys('rate:phone-request:*'));expect((await send()).status).toBe(200);await clearCooldown();}
  await redis.del(prefix+'hour');await redis.del(...await redis.keys('rate:phone-request:*'));
  expect((await send()).body.error.code).toBe('OTP_SEND_LIMIT');
 });
 it('applies a separate request IP limit across different phone numbers',async()=>{
  for(let i=0;i<10;i++)expect((await send({phone:`+9705912300${String(i).padStart(2,'0')}`,purpose:'login'})).status).toBe(200);
  const limited=await send({phone:'+970591239999',purpose:'login'});
  expect(limited.status).toBe(429);expect(limited.body.error.code).toBe('RATE_LIMITED');
  expect(limited.body.error.details.retryAfterSeconds).toBe(Number(limited.headers['retry-after']));
  expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
 });
 it('does not reveal whether a login number exists before verifying its code or create it afterward',async()=>{
  const c=await send({phone,purpose:'login'});
  expect(c.status).toBe(200);expect(await db.user.count()).toBe(0);
  const result=await verify(c.body.challengeId,sentCode());
  expect(result.status).toBe(404);expect(result.body.error.code).toBe('PHONE_ACCOUNT_NOT_FOUND');
  expect(await db.user.count()).toBe(0);expect(await db.refreshToken.count()).toBe(0);
 });
 it('returns the same verified account and never replaces its name or role on re-registration',async()=>{
  const existing=await db.user.create({data:{phone,phoneVerifiedAt:new Date(),fullName:'Verified Admin',role:'ADMIN',profileCompletedAt:new Date(),wallet:{create:{}}}});
  const c=await send({phone,purpose:'register',fullName:'Attacker Supplied Name'});
  const result=await verify(c.body.challengeId,sentCode());
  expect(result.status).toBe(200);expect(result.body).toMatchObject({isNewUser:false,user:{id:existing.id,fullName:'Verified Admin',role:'ADMIN'}});
  await clearCooldown();const login=await send({phone,purpose:'login'});
  expect((await verify(login.body.challengeId,sentCode())).body.user.id).toBe(existing.id);
  expect(await db.user.count()).toBe(1);
 });
 it.each([{verified:false,status:'ACTIVE' as const,code:'PHONE_MIGRATION_REQUIRED',expected:409},{verified:true,status:'SUSPENDED' as const,code:'ACCOUNT_SUSPENDED',expected:403}])('blocks unsafe existing account $code after verification',async({verified,status,code,expected})=>{
  await db.user.create({data:{phone,phoneVerifiedAt:verified?new Date():null,fullName:'Existing User',status}});
  const c=await send({phone,purpose:'login'});expect(c.status).toBe(200);
  const result=await verify(c.body.challengeId,sentCode());
  expect(result.status).toBe(expected);expect(result.body.error.code).toBe(code);
  expect(await db.refreshToken.count()).toBe(0);
 });
 it.each(['+972591234567','0591234567','00970591234567','591234567'])('does not create a duplicate account for an existing noncanonical phone %s',async(legacyPhone)=>{
  await db.user.create({data:{phone:legacyPhone,fullName:'Legacy User'}});
  const c=await send();expect(c.status).toBe(200);
  const result=await verify(c.body.challengeId,sentCode());
  expect(result.status).toBe(409);expect(result.body.error.code).toBe('PHONE_MIGRATION_REQUIRED');
  expect(await db.user.count()).toBe(1);expect(await db.refreshToken.count()).toBe(0);
 });
 it('blocks ambiguous existing accounts rather than silently choosing between dialing aliases',async()=>{
  await db.user.createMany({data:[{phone,phoneVerifiedAt:new Date(),fullName:'Canonical User'},{phone:'+972591234567',phoneVerifiedAt:new Date(),fullName:'Legacy Admin',role:'ADMIN'}]});
  const c=await send({phone,purpose:'login'});
  const result=await verify(c.body.challengeId,sentCode());
  expect(result.status).toBe(409);expect(result.body.error.code).toBe('PHONE_MIGRATION_REQUIRED');
  expect(await db.refreshToken.count()).toBe(0);
 });
 it('does not allow verification while SMS delivery is pending or after delivery fails',async()=>{
  let release!:(value:'sms')=>void;
  vi.mocked(provider.sendOtp).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const pending=send().then(r=>r);
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  const challengeId=(await redis.keys('otp:phone:challenge:*'))[0]!.split(':').at(-1)!;
  const code=sentCode();expect((await verify(challengeId,code)).status).toBe(401);
  release('sms');expect((await pending).status).toBe(200);
  await clearCooldown();vi.mocked(provider.sendOtp).mockRejectedValueOnce(new Error('Provider failure'));
  expect((await send()).status).toBe(503);
  expect(await redis.keys('otp:phone:challenge:*')).toHaveLength(0);
  expect((await verify(challengeId,code)).status).toBe(401);
 });
 it('preserves a replacement challenge when an older delivery fails late',async()=>{
  let fail!:(error:Error)=>void;
  vi.mocked(provider.sendOtp).mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject;}));
  const older=send().then(r=>r);
  await vi.waitFor(()=>expect(fail).toBeTypeOf('function'));
  await clearCooldown();const newer=await send(),newCode=sentCode();
  expect(newer.status).toBe(200);
  fail(new Error('Old delivery timed out'));expect((await older).status).toBe(503);
  expect((await verify(newer.body.challengeId,newCode)).status).toBe(200);
 });
});

describe('SMS provider boundaries',()=>{
 const original={SMS_PROVIDER:env.SMS_PROVIDER,NODE_ENV:env.NODE_ENV,TWILIO_ACCOUNT_SID:env.TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN:env.TWILIO_AUTH_TOKEN,TWILIO_FROM:env.TWILIO_FROM};
 afterEach(()=>Object.assign(env,original));
 it('rejects development SMS outside development and never returns a code through the API',async()=>{
  env.NODE_ENV='production';env.SMS_PROVIDER='development';
  const result=await send();
  expect(result.status).toBe(503);expect(result.body.error.code).toBe('SMS_DELIVERY_FAILED');
  expect(await redis.keys('otp:phone:challenge:*')).toHaveLength(0);
 });
 it('submits Twilio form data over HTTPS and accepts only an accepted provider response',async()=>{
  env.SMS_PROVIDER='twilio';env.TWILIO_ACCOUNT_SID='AC'+'a'.repeat(32);env.TWILIO_AUTH_TOKEN='test-secret';env.TWILIO_FROM='+15550001111';
  let requestUrl='',requestInit:RequestInit|undefined;
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{requestUrl=url;requestInit=init;return new Response(JSON.stringify({sid:'SM'+'b'.repeat(32),status:'queued',error_code:null}),{status:201,headers:{'Content-Type':'application/json'}});});
  const c=await send();expect(c.status).toBe(200);expect(c.body.delivery).toBe('sms');
  expect(requestUrl).toBe('https://api.twilio.com/2010-04-01/Accounts/AC'+'a'.repeat(32)+'/Messages.json');
  const body=requestInit!.body as URLSearchParams;
  expect(body.get('To')).toBe(phone);expect(body.get('From')).toBe('+15550001111');
  const code=body.get('Body')!.match(/\b\d{6}\b/)![0];
  expect((await verify(c.body.challengeId,code)).status).toBe(200);
  await clearCooldown();
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({sid:'SM'+'b'.repeat(32),status:'failed',error_code:21614}),{status:201}));
  expect((await send()).status).toBe(503);
  expect(await redis.keys('otp:phone:challenge:*')).toHaveLength(0);
 });
});
