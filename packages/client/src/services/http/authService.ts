import type { AuthConfig, AuthService, AuthVerificationOptions } from '@parkflow/contracts/services';
import { api, refreshSession } from './apiClient';
import { useAuthStore } from '../../store/authStore';
import { bindingOf, bootstrapBrowserSession, browserLogout, isWebSession, markBrowserLogout, validateWebSession, webSessionsEnabled, withBrowserAuthLock } from './browserSession';
function cancelledVerification() {
 const error=new Error('Verification request was cancelled');error.name='AbortError';return error;
}
async function signIn(path:string,body:unknown,options?:AuthVerificationOptions){
 const verify=async()=>{
 if(options?.shouldApply?.()===false)throw cancelledVerification();
 if(webSessionsEnabled){
  // Establish the stable, HttpOnly browser context before any login cookie is
  // issued. Do not publish an existing identity during explicit verification.
  await api('/auth/web-session/bootstrap',{public:true});
  if(options?.shouldApply?.()===false)throw cancelledVerification();
 }
 const result=await api<Awaited<ReturnType<AuthService['verifyOtp']>>>(path,{method:'POST',body,public:true});
 if(webSessionsEnabled){
  const session=validateWebSession(result.session);
  if(result.user?.id!==session.userId)throw new Error('Invalid browser identity');
 }
 try{
  if(options?.shouldApply?.()===false)throw cancelledVerification();
  await useAuthStore.getState().signIn(result.session,result.user,options?.shouldApply);
 }catch(error){
  // Fetch has already applied Set-Cookie. Clear a cancelled login while the
  // browser auth lock still prevents a newer verification from publishing.
  if(webSessionsEnabled&&isWebSession(result.session)){
   await markBrowserLogout(result.session).catch(()=>undefined);
   await browserLogout(result.session).catch(()=>undefined);
  }
  throw error;
 }
 return result;
 };
 return webSessionsEnabled?withBrowserAuthLock(verify):verify();
}
export const httpAuthService:AuthService={
 async getConfig(){
  const config=await api<AuthConfig>('/auth/config',{public:true});
  if(typeof config?.developmentLoginEnabled!=='boolean'||typeof config?.developmentEmailLoginEnabled!=='boolean'
   ||(config.loginMethod!=='email'&&config.loginMethod!=='phone')
   ||(config.developmentEmailLoginEnabled&&config.loginMethod!=='email')
   ||(config.developmentLoginEnabled&&config.loginMethod!=='phone')
   ||(config.developmentEmailLoginEnabled&&config.developmentLoginEnabled)) throw new Error('Invalid authentication config');
  return config;
 },
 devPhoneLogin:body=>signIn('/auth/phone/dev-login',body),
 requestPhoneOtp:body=>api('/auth/phone/request-otp',{method:'POST',body,public:true}),
 verifyPhoneOtp:body=>signIn('/auth/phone/verify-otp',body),
 completePhoneProfile:body=>api('/users/me/complete-profile',{method:'POST',body}),
 requestOtp:body=>api('/auth/request-otp',{method:'POST',body,public:true}),
 devLogin:body=>signIn('/auth/dev-login',body),
 verifyOtp:(body,options)=>signIn('/auth/verify-otp',body,options),
 completeProfile:({fullName})=>api('/users/me',{method:'PATCH',body:{fullName}}),
 refresh:refreshToken=>webSessionsEnabled?refreshSession():api('/auth/refresh',{method:'POST',body:{refreshToken},public:true}),
 async signOut(){
  if(webSessionsEnabled){
   const previous=useAuthStore.getState().session;
   await withBrowserAuthLock(async()=>{
    let completed=false;
    try{
     if(isWebSession(previous)){
      await markBrowserLogout(previous).catch(()=>undefined);
      let latest=previous;
      try{
       const current=await bootstrapBrowserSession(bindingOf(previous),true);
       if(current)latest=current.session;
      }catch(error){
       if((error as {details?:{serverCode?:string}}).details?.serverCode==='SESSION_CHANGED')throw error;
       // A failed bootstrap must not prevent conditional logout being tried.
      }
      await browserLogout(latest);completed=true;
     }
    }finally{
     if(useAuthStore.getState().session===previous)await useAuthStore.getState().signOut(completed);
    }
   });
  }else{try{await api('/auth/logout',{method:'POST',body:{}});}finally{await useAuthStore.getState().signOut();}}
 },
};
