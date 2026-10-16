import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { authenticateRequest } from '../modules/auth/webSession';
import { ApiError } from '../utils/errors';
declare global {namespace Express {interface Request {auth?:{userId:string;sid:string;role:Role;exp:number}}}}
export const auth:RequestHandler=async(req,_res,next)=>{try{req.auth=await authenticateRequest(req);next();}catch(e){next(e);}};
export const roles=(allowed:Role[]):RequestHandler=>(req,_res,next)=>{if(!req.auth||!allowed.includes(req.auth.role))return next(new ApiError(403,'FORBIDDEN','You do not have permission'));next();};
