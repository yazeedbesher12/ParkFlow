import { useAuthStore } from '../store/authStore';
import { sessionIdentity } from '../services/http/browserSession';
import { AppError } from './errors';

/** Stop a multi-request operation before a later login can receive its private inputs. */
export function captureSessionGuard(): () => void {
  const identity = sessionIdentity(useAuthStore.getState().session);
  return () => {
    if (sessionIdentity(useAuthStore.getState().session) !== identity) {
      throw new AppError('unauthorized', 'Session changed', { serverCode: 'SESSION_CHANGED' });
    }
  };
}
