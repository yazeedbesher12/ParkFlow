import type { RoutingService } from '../types';
import { api } from './apiClient';
export const httpRoutingService:RoutingService={getRoute:(origin,destination)=>api('/routes/plan',{method:'POST',body:{origin,destination}})};
