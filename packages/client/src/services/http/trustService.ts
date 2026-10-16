import type { TrustService } from '@parkflow/contracts/services';
import { api } from './apiClient';
export const httpTrustService:TrustService={get:()=>api('/trust/me')};
