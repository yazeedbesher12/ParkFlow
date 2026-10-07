import type { AuthConfig, AuthService } from '../types';
import { api } from './apiClient';
import { useAuthStore } from '@/store/authStore';
async function signIn(path:string,body:unknown){const result=await api<Awaited<ReturnType<AuthService['verifyOtp']>>>(path,{method:'POST',body,public:true});await useAuthStore.getState().signIn(result.session,result.user);return result;}
export const httpAuthService:AuthService={
 async getConfig(){
  const config=await api<AuthConfig>('/auth/config',{public:true});
  if(typeof config?.developmentLoginEnabled!=='boolean'||typeof config?.developmentEmailLoginEnabled!=='boolean'
   ||(config.loginMethod!=='email'&&config.loginMethod!=='phone')
   ||config.developmentEmailLoginEnabled!==(config.loginMethod==='email')
   ||(config.developmentEmailLoginEnabled&&config.developmentLoginEnabled)) throw new Error('Invalid authentication config');
  return config;
 },
 devPhoneLogin:body=>signIn('/auth/phone/dev-login',body),
 requestPhoneOtp:body=>api('/auth/phone/request-otp',{method:'POST',body,public:true}),
 verifyPhoneOtp:body=>signIn('/auth/phone/verify-otp',body),
 completePhoneProfile:body=>api('/users/me/complete-profile',{method:'POST',body}),
 requestOtp:body=>api('/auth/request-otp',{method:'POST',body,public:true}),
 devLogin:body=>signIn('/auth/dev-login',body),
 verifyOtp:body=>signIn('/auth/verify-otp',body),
 completeProfile:({fullName})=>api('/users/me',{method:'PATCH',body:{fullName}}),
 refresh:refreshToken=>api('/auth/refresh',{method:'POST',body:{refreshToken},public:true}),
 async signOut(){try{await api('/auth/logout',{method:'POST',body:{}});}finally{await useAuthStore.getState().signOut();}},
};
