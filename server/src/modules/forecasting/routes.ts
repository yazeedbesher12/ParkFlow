import { z } from 'zod';
import { actor, empty, operators, param, route } from '../../apiRegistry';
import { analytics, forecast } from './service';
route('get', '/parking/zones/:id/forecast', z.object({ arrivalAt: z.iso.datetime({ offset: true }) }).strict(), (r, b) => forecast(param(r), b.arrivalAt));
route('get', '/operator/analytics', empty, r => analytics(actor(r)), operators);
