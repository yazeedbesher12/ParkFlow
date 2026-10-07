import { create } from 'zustand';
import { appConfigService } from '../services/http/appConfigService';
import { defaultAppConfig, type PublishedAppConfig } from '../types/appConfig';

interface ConfigState extends PublishedAppConfig { refresh: (options?: { force?: boolean }) => Promise<void> }
let pending: Promise<void> | null = null;
export const useAppConfigStore = create<ConfigState>((set, get) => ({
  config: defaultAppConfig, version: 0, revisionId: null,
  refresh: (options) => {
    // A publication must read after an older in-flight request has completed.
    if (pending) return options?.force ? pending.then(() => get().refresh()) : pending;
    pending = appConfigService.published().then(value => set(current => value.version >= current.version ? value : current)).catch(() => {
      // A network failure keeps the last validated publication, or initial safe defaults.
    }).finally(() => { pending = null; });
    return pending;
  },
}));
