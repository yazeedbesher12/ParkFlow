import { createHmac,randomInt,randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { redis } from '../../database/redis';
import { db,atomic,lock,type Tx } from '../../database/client';
import { sms } from '../../providers/sms';
import { assert,ApiError,requireValue } from '../../utils/errors';
export const digest=(v:string)=>createHmac('sha256',env.JWT_REFRESH_SECRET).update(v).digest('hex');
export function normalizePhone(countryCode:string,phone:string){
 const digits=(countryCode+phone).replace(/[?-?]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[^0-9]/g,'');
 let national=phone.replace(/[^0-9]/g,'').replace(/^0/,'');
 if(phone.startsWith('+')) {assert(/^\+(970|972)5\d{8}$/.test(phone),'VALIDATION','Invalid phone number');return phone;}
 assert(['+970','+972'].includes(countryCode)&&/^5\d{8}$/.test(national),'VALIDATION','Use a valid Palestinian mobile number');
 return countryCode+national;
}
export async function requestOtp(input:{countryCode:string;phone:string}){
 const phone=normalizePhone(input.countryCode,input.phone);
 assert(await redis.set(`otp:cooldown:${phone}`,'1','EX',60,'NX'),'OTP_COOLDOWN','Please wait before requesting another code',429);
 const challengeId=randomUUID(),code=String(randomInt(100000,1000000));
 await redis.hset(`otp:${challengeId}`,{phone,hash:digest(challengeId+code),tries:'0'});await redis.expire(`otp:${challengeId}`,300);
 try {await sms.sendOtp(phone,code);}catch(e){await redis.del(`otp:${challengeId}`,`otp:cooldown:${phone}`);throw e;}
 return {challengeId,phone,resendAfterSeconds:60,expiresAt:new Date(Date.now()+300000).toISOString(),...(env.SMS_PROVIDER==='development'&&env.NODE_ENV!=='production'?{devCode:code}:{})};
}
async function issue(tx:Tx,user:User,meta:{device?:string;ip?:string},familyId:string=randomUUID()){
 const id=randomUUID(),expiresAt=new Date(Date.now()+env.REFRESH_TOKEN_TTL*1000);
 const refreshToken=jwt.sign({sub:user.id,jti:id,familyId,kind:'refresh'},env.JWT_REFRESH_SECRET,{algorithm:'HS256',expiresIn:env.REFRESH_TOKEN_TTL,issuer:'parkflow',audience:'parkflow-refresh'});
 await tx.refreshToken.create({data:{id,userId:user.id,tokenHash:digest(refreshToken),familyId,expiresAt,...meta}});
 return {userId:user.id,accessToken:jwt.sign({sub:user.id,sid:id,kind:'access'},env.JWT_ACCESS_SECRET,{algorithm:'HS256',expiresIn:env.ACCESS_TOKEN_TTL,issuer:'parkflow',audience:'parkflow-api'}),refreshToken,expiresAt:new Date(Date.now()+env.ACCESS_TOKEN_TTL*1000).toISOString()};
}
export async function verifyOtp(input:{challengeId:string;code:string},meta:{device?:string;ip?:string}){
 const result=String(await redis.eval(`
 local h=redis.call('HGET',KEYS[1],'hash')
 if not h then return 'expired' end
 local tries=tonumber(redis.call('HGET',KEYS[1],'tries') or '0')
 if tries>=5 then return 'locked' end
 if h~=ARGV[1] then redis.call('HINCRBY',KEYS[1],'tries',1);return 'invalid' end
 local phone=redis.call('HGET',KEYS[1],'phone');redis.call('DEL',KEYS[1]);return phone
 `,1,`otp:${input.challengeId}`,digest(input.challengeId+input.code)));
 assert(result.startsWith('+'),'OTP_'+result.toUpperCase(),'The code is invalid, expired, or has reached its retry limit',401);
 return atomic(async tx=>{
 const existing=await tx.user.findUnique({where:{phone:result}});
 const user=existing?await tx.user.update({where:{id:existing.id},data:{lastLoginAt:new Date(),phoneVerifiedAt:new Date()}}):await tx.user.create({data:{phone:result,countryCode:result.slice(0,4),phoneVerifiedAt:new Date(),lastLoginAt:new Date(),wallet:{create:{}}}});
 assert(user.status==='ACTIVE','ACCOUNT_SUSPENDED','This account is suspended',403);
 return {session:await issue(tx,user,meta),user,isNewUser:!user.fullName};
 });
}
export function verifyAccess(token:string){try{
 const v=jwt.verify(token,env.JWT_ACCESS_SECRET,{algorithms:['HS256'],issuer:'parkflow',audience:'parkflow-api'}) as jwt.JwtPayload;
 assert(v.kind==='access'&&typeof v.sub==='string'&&typeof v.sid==='string','UNAUTHORIZED','Invalid token',401);return {userId:v.sub,sid:v.sid,exp:v.exp!};
 }catch{throw new ApiError(401,'UNAUTHORIZED','Invalid or expired access token');}}
export async function authenticate(token:string){const claims=verifyAccess(token);const record=await db.refreshToken.findUnique({where:{id:claims.sid},include:{user:true}});
 assert(record&&!record.revokedAt&&record.expiresAt>new Date()&&record.user.status==='ACTIVE','UNAUTHORIZED','Session has ended',401);return {...claims,role:record.user.role};}
export async function refresh(token:string,meta:{device?:string;ip?:string}){
 try{jwt.verify(token,env.JWT_REFRESH_SECRET,{algorithms:['HS256'],issuer:'parkflow',audience:'parkflow-refresh'});}catch{throw new ApiError(401,'UNAUTHORIZED','Refresh token expired');}
 const result=await atomic(async tx=>{const old=await tx.refreshToken.findUnique({where:{tokenHash:digest(token)},include:{user:true}});
 if(!old)return null;
 await lock(tx,`refresh:${old.familyId}`);
 const current=requireValue(await tx.refreshToken.findUnique({where:{id:old.id}}));
 if(current.revokedAt){await tx.refreshToken.updateMany({where:{familyId:old.familyId,revokedAt:null},data:{revokedAt:new Date()}});return null;}
 if(current.expiresAt<new Date()||old.user.status!=='ACTIVE')return null;
 const next=await issue(tx,old.user,meta,old.familyId);
 const nextClaims=jwt.decode(next.refreshToken) as jwt.JwtPayload;
 await tx.refreshToken.update({where:{id:old.id},data:{revokedAt:new Date(),replacedBy:nextClaims.jti}});return next;});
 assert(result,'UNAUTHORIZED','Refresh token was revoked or reused',401);return result;
}
export async function logout(userId:string,sid:string,all=false){await db.refreshToken.updateMany({where:{userId,...(all?{}:{id:sid}),revokedAt:null},data:{revokedAt:new Date()}});}
