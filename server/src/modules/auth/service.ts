import { createHmac,randomInt,randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { developmentPhoneLoginEnabled, developmentEmailLoginEnabled, requireOtpEnabled } from '../../config/developmentAuth';
import { redis } from '../../database/redis';
import { db,atomic,lock,type Tx } from '../../database/client';
import { emailProvider } from '../../providers/email';
import { z } from 'zod';
import { assert,ApiError,requireValue } from '../../utils/errors';
import { userView } from '../users/service';
export const digest=(v:string)=>createHmac('sha256',env.JWT_REFRESH_SECRET).update(v).digest('hex');
export const normalizeEmail=(value:string)=>z.email().max(254).parse(value.trim().toLowerCase());
export const devEmailLoginSchema=z.object({
 email:z.string().trim().toLowerCase().pipe(z.email().max(254)),
 purpose:z.enum(['register','login']).optional(),
 fullName:z.string().trim().min(1).max(200).optional(),
}).strict().superRefine((value,context)=>{
 if(value.purpose==='register'&&!value.fullName)context.addIssue({code:'custom',path:['fullName'],message:'Name is required to register'});
});
const ADMIN_SESSION_MAX_AGE_MS=8*60*60*1000;
async function revokeExpiredAdminFamily(tx:Tx,user:Pick<User,'id'|'role'>,familyId:string){
 if(user.role!=='ADMIN')return false;
 // Include revoked ancestors: refreshing must never move the absolute deadline.
 const oldest=await tx.refreshToken.findFirst({where:{userId:user.id,familyId},orderBy:{createdAt:'asc'},select:{createdAt:true}});
 if(oldest&&Date.now()-oldest.createdAt.getTime()<ADMIN_SESSION_MAX_AGE_MS)return false;
 await tx.refreshToken.updateMany({where:{userId:user.id,familyId,revokedAt:null},data:{revokedAt:new Date()}});
 return true;
}
export async function requestOtp(input:{email:string}){
 requireOtpEnabled();
 const email=normalizeEmail(input.email);
 const cooldown=`otp:email:cooldown:${email}`;
 assert(await redis.set(cooldown,'1','EX',60,'NX'),'OTP_COOLDOWN','Please wait before requesting another code',429);
 const challengeId=randomUUID(),code=String(randomInt(100000,1000000));
 const key=`otp:email:${challengeId}`;
 await redis.multi().hset(key,{email,hash:digest(challengeId+code),tries:'0'}).expire(key,300).exec();
 try {await emailProvider.sendOtp(email,code);}catch {
  await redis.del(key,cooldown);
  throw new ApiError(503,'EMAIL_DELIVERY_FAILED','Unable to send the verification email. Please try again.');
 }
 return {challengeId,email,resendAfterSeconds:60,expiresAt:new Date(Date.now()+300000).toISOString()};
}
export async function issue(tx:Tx,user:User,meta:{device?:string;ip?:string},familyId:string=randomUUID(),developmentPhoneLogin=false,developmentEmailLogin=false){
 const id=randomUUID(),expiresAt=new Date(Date.now()+env.REFRESH_TOKEN_TTL*1000);
 const mode={...(developmentPhoneLogin?{developmentPhoneLogin:true}:{}),...(developmentEmailLogin?{developmentEmailLogin:true}:{})};
 const refreshToken=jwt.sign({sub:user.id,jti:id,familyId,kind:'refresh',...mode},env.JWT_REFRESH_SECRET,{algorithm:'HS256',expiresIn:env.REFRESH_TOKEN_TTL,issuer:'parkflow',audience:'parkflow-refresh'});
 await tx.refreshToken.create({data:{id,userId:user.id,tokenHash:digest(refreshToken),familyId,expiresAt,...meta}});
 return {userId:user.id,accessToken:jwt.sign({sub:user.id,sid:id,kind:'access',...mode},env.JWT_ACCESS_SECRET,{algorithm:'HS256',expiresIn:env.ACCESS_TOKEN_TTL,issuer:'parkflow',audience:'parkflow-api'}),refreshToken,expiresAt:new Date(Date.now()+env.ACCESS_TOKEN_TTL*1000).toISOString()};
}
export async function verifyOtp(input:{challengeId:string;code:string},meta:{device?:string;ip?:string}){
 requireOtpEnabled();
 const result=String(await redis.eval(`
 local h=redis.call('HGET',KEYS[1],'hash')
 if not h then return 'expired' end
 local tries=tonumber(redis.call('HGET',KEYS[1],'tries') or '0')
 if tries>=5 then return 'locked' end
 if h~=ARGV[1] then redis.call('HINCRBY',KEYS[1],'tries',1);return 'invalid' end
 local email=redis.call('HGET',KEYS[1],'email');redis.call('DEL',KEYS[1]);return email
 `,1,`otp:email:${input.challengeId}`,digest(input.challengeId+input.code)));
 assert(result.includes('@'),'OTP_'+result.toUpperCase(),'The code is invalid, expired, or has reached its retry limit',401);
 return atomic(async tx=>{
 await lock(tx,`email:${result}`);
 const existing=await tx.user.findUnique({where:{email:result}});
 assert(!existing || existing.emailVerifiedAt || existing.emailVerificationPending,'EMAIL_MIGRATION_REQUIRED','Contact support to link your existing account to a verified email',409);
 const user=existing?await tx.user.update({where:{id:existing.id},data:{lastLoginAt:new Date(),emailVerifiedAt:new Date(),emailVerificationPending:false}}):await tx.user.create({data:{email:result,emailVerifiedAt:new Date(),lastLoginAt:new Date(),wallet:{create:{}}}});
 assert(user.status==='ACTIVE','ACCOUNT_SUSPENDED','This account is suspended',403);
 return {session:await issue(tx,user,meta),user:userView(user),isNewUser:!user.fullName};
 });
}
export async function devLogin(input:z.input<typeof devEmailLoginSchema>,meta:{device?:string;ip?:string}){
 assert(developmentEmailLoginEnabled(),'DEV_LOGIN_DISABLED','Development login is disabled',403);
 const parsed=devEmailLoginSchema.parse(input);
 const email=normalizeEmail(parsed.email);
 return atomic(async tx=>{
  await lock(tx,`email:${email}`);
  const existing=await tx.user.findUnique({where:{email}});
  assert(!existing||existing.status==='ACTIVE','ACCOUNT_SUSPENDED','This account is suspended',403);
  assert(existing||parsed.purpose!=='login','EMAIL_ACCOUNT_NOT_FOUND','Create an account with this email first',404);
  const fullName=parsed.fullName??'';
  const user=existing
   ?await tx.user.update({where:{id:existing.id},data:{lastLoginAt:new Date()}})
   :await tx.user.create({data:{email,emailVerificationPending:true,fullName,firstName:fullName.split(/\s+/)[0]??'',lastName:fullName.split(/\s+/).slice(1).join(' '),lastLoginAt:new Date(),wallet:{create:{}}}});
  await tx.auditLog.create({data:{actorUserId:user.id,action:'auth.development_email_login',resourceType:'user',resourceId:user.id,ip:meta.ip,userAgent:meta.device}});
  return {session:await issue(tx,user,meta,undefined,false,true),user:userView(user),isNewUser:!user.profileCompletedAt};
 });
}
export function verifyAccess(token:string){try{
 const v=jwt.verify(token,env.JWT_ACCESS_SECRET,{algorithms:['HS256'],issuer:'parkflow',audience:'parkflow-api'}) as jwt.JwtPayload;
 assert(!v.developmentPhoneLogin||developmentPhoneLoginEnabled(),'UNAUTHORIZED','Development session has ended. Sign in with a verification code.',401);
 assert(!v.developmentEmailLogin||developmentEmailLoginEnabled(),'UNAUTHORIZED','Development email session has ended. Sign in again.',401);
 assert(v.kind==='access'&&typeof v.sub==='string'&&typeof v.sid==='string','UNAUTHORIZED','Invalid token',401);return {userId:v.sub,sid:v.sid,exp:v.exp!};
 }catch{throw new ApiError(401,'UNAUTHORIZED','Invalid or expired access token');}}
export async function authenticate(token:string){const claims=verifyAccess(token);const record=await db.refreshToken.findUnique({where:{id:claims.sid},include:{user:true}});
 assert(record&&!record.revokedAt&&record.expiresAt>new Date()&&record.user.status==='ACTIVE','UNAUTHORIZED','Session has ended',401);
 if(record.user.role==='ADMIN'){
  const role=await atomic(async tx=>{
   await lock(tx,`refresh:${record.familyId}`);
   const current=await tx.refreshToken.findUnique({where:{id:record.id},include:{user:true}});
   if(!current||current.revokedAt||current.expiresAt<=new Date()||current.user.status!=='ACTIVE')return null;
   if(await revokeExpiredAdminFamily(tx,current.user,current.familyId))return null;
   return current.user.role;
  });
  // Throw only after the transaction commits, preserving family revocation.
  assert(role,'UNAUTHORIZED','Admin session has ended. Sign in again.',401);return {...claims,role};
 }
 return {...claims,role:record.user.role};}
export async function refresh(token:string,meta:{device?:string;ip?:string}){
 let claims:jwt.JwtPayload;
 try{claims=jwt.verify(token,env.JWT_REFRESH_SECRET,{algorithms:['HS256'],issuer:'parkflow',audience:'parkflow-refresh'}) as jwt.JwtPayload;}catch{throw new ApiError(401,'UNAUTHORIZED','Refresh token expired');}
 assert(claims.kind==='refresh'&&(!claims.developmentPhoneLogin||developmentPhoneLoginEnabled())&&(!claims.developmentEmailLogin||developmentEmailLoginEnabled()),'UNAUTHORIZED','Session has ended. Sign in again.',401);
 const result=await atomic(async tx=>{const old=await tx.refreshToken.findUnique({where:{tokenHash:digest(token)},include:{user:true}});
 if(!old)return null;
 await lock(tx,`refresh:${old.familyId}`);
 const current=requireValue(await tx.refreshToken.findUnique({where:{id:old.id},include:{user:true}}));
 if(current.revokedAt){await tx.refreshToken.updateMany({where:{familyId:old.familyId,revokedAt:null},data:{revokedAt:new Date()}});return null;}
 if(await revokeExpiredAdminFamily(tx,current.user,current.familyId))return null;
 if(current.expiresAt<=new Date()||current.user.status!=='ACTIVE')return null;
 const next=await issue(tx,current.user,meta,old.familyId,claims.developmentPhoneLogin===true,claims.developmentEmailLogin===true);
 const nextClaims=jwt.decode(next.refreshToken) as jwt.JwtPayload;
 await tx.refreshToken.update({where:{id:old.id},data:{revokedAt:new Date(),replacedBy:nextClaims.jti}});return next;});
 assert(result,'UNAUTHORIZED','Refresh token was revoked or reused',401);return result;
}
export async function logout(userId:string,sid:string,all=false){await db.refreshToken.updateMany({where:{userId,...(all?{}:{id:sid}),revokedAt:null},data:{revokedAt:new Date()}});}
