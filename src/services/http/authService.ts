import type { AuthService } from '../types';
import { api } from './apiClient';
import { useAuthStore } from '@/store/authStore';
export const httpAuthService:AuthService={
 requestOtp:body=>api('/auth/request-otp',{method:'POST',body,public:true}),
 async verifyOtp(body){const result=await api<Awaited<ReturnType<AuthService['verifyOtp']>>>('/auth/verify-otp',{method:'POST',body,public:true});await useAuthStore.getState().signIn(result.session,result.user);return result;},
 completeProfile:({fullName})=>api('/users/me',{method:'PATCH',body:{fullName}}),
 refresh:refreshToken=>api('/auth/refresh',{method:'POST',body:{refreshToken},public:true}),
 async signOut(){try{await api('/auth/logout',{method:'POST',body:{}});}finally{await useAuthStore.getState().signOut();}},
};
