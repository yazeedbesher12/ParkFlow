import type { AuthService } from '../types';
import { api } from './apiClient';
import { useAuthStore } from '@/store/authStore';
async function signIn(path:string,body:unknown){const result=await api<Awaited<ReturnType<AuthService['verifyOtp']>>>(path,{method:'POST',body,public:true});await useAuthStore.getState().signIn(result.session,result.user);return result;}
export const httpAuthService:AuthService={
 requestOtp:body=>api('/auth/request-otp',{method:'POST',body,public:true}),
 devLogin:body=>signIn('/auth/dev-login',body),
 verifyOtp:body=>signIn('/auth/verify-otp',body),
 completeProfile:({fullName})=>api('/users/me',{method:'PATCH',body:{fullName}}),
 refresh:refreshToken=>api('/auth/refresh',{method:'POST',body:{refreshToken},public:true}),
 async signOut(){try{await api('/auth/logout',{method:'POST',body:{}});}finally{await useAuthStore.getState().signOut();}},
};
