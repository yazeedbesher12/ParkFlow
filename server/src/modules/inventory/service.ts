import { manualProvider } from './manualProvider';
import type { InventoryProvider } from './types';

const providers = new Map<string, InventoryProvider>([['manual', manualProvider]]);
export function providerFor(name?: string | null) { return providers.get((name ?? 'manual').toLowerCase()); }
export { manualProvider };
