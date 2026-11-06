import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/client';
import { routingService } from '../src/modules/routing/service';
import * as roads from '../src/modules/roads/service';

vi.mock('../src/modules/routing/traffic', () => ({ enrichTraffic: vi.fn().mockResolvedValue(undefined) }));

const mobility = { avoidHighways: false, preferSmootherRoads: false, accessibleParking: false, stepFreeAccess: false };
const from = (offset: number) => ({ latitude: 31.9 + offset, longitude: 35.2 });
const to = (offset: number) => ({ latitude: 31.91 + offset, longitude: 35.21 });
const reply = (offset: number) => ({ json: async () => ({ code: 'Ok', routes: [{
  distance: 1000, duration: 100, geometry: { coordinates: [[35.2, 31.9 + offset], [35.21, 31.91 + offset]] },
}] }) });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('mobility-aware routing', () => {
  it('excludes motorways when requested and keeps the geometry cache separate', async () => {
    const fetch = vi.fn().mockResolvedValue(reply(0.01));
    vi.stubGlobal('fetch', fetch);
    await routingService.getRoute(from(0.01), to(0.01), { mode: 'fastest' });
    const route = await routingService.getRoute(from(0.01), to(0.01), { mode: 'fastest', mobility: { ...mobility, avoidHighways: true } });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![0]).not.toContain('exclude=');
    expect(fetch.mock.calls[1]![0]).toContain('exclude=motorway');
    expect(route.mobility.notices).toEqual(['highways_applied']);
  });

  it('falls back honestly when the engine cannot exclude highways', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ json: async () => ({ code: 'InvalidValue' }) }).mockResolvedValueOnce(reply(0.02));
    vi.stubGlobal('fetch', fetch);
    const route = await routingService.getRoute(from(0.02), to(0.02), { mode: 'fastest', mobility: { ...mobility, avoidHighways: true } });
    expect(fetch.mock.calls[0]![0]).toContain('exclude=motorway');
    expect(fetch.mock.calls[1]![0]).not.toContain('exclude=');
    expect(route.source).toBe('osrm');
    expect(route.mobility.notices).toEqual(['highways_unavailable']);
  });

  it('ranks alternatives around current confirmed hazards without discarding checkpoints', async () => {
    const hazard = { latitude: 32.0, longitude: 35.205 };
    const fetch = vi.fn().mockResolvedValue({ json: async () => ({ code: 'Ok', routes: [
      { distance: 1000, duration: 100, geometry: { coordinates: [[35.2, 32.0], [35.21, 32.0]] } },
      { distance: 1500, duration: 150, geometry: { coordinates: [[35.2, 32.0], [35.205, 32.01], [35.21, 32.0]] } },
    ] }) });
    vi.stubGlobal('fetch', fetch);
    const reports = vi.spyOn(db.roadReport, 'findMany').mockResolvedValue([hazard] as never);
    const checkpoints = vi.spyOn(roads, 'checkpoints').mockResolvedValue([]);
    const route = await routingService.getRoute({ latitude: 32.0, longitude: 35.2 }, { latitude: 32.0, longitude: 35.21 }, { mobility: { ...mobility, preferSmootherRoads: true } });
    expect(route.durationSeconds).toBe(150);
    expect(route.alternatives[0]?.durationSeconds).toBe(100);
    expect(route.mobility.notices).toEqual(['smoother_partial']);
    expect(checkpoints).toHaveBeenCalled();
    expect(reports.mock.calls[0]![0]).toMatchObject({ where: { status: 'confirmed', isDemo: false, expiresAt: { gt: expect.any(Date) }, type: { in: ['road_hazard', 'construction'] } } });
  });

  it('preserves routes on report failure and does not claim parking or step-free verification', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(0.04)));
    vi.spyOn(db.roadReport, 'findMany').mockRejectedValue(new Error('unavailable'));
    const route = await routingService.getRoute(from(0.04), to(0.04), { profile: 'walking', mode: 'fastest', mobility: { ...mobility, avoidHighways: true, preferSmootherRoads: true, accessibleParking: true, stepFreeAccess: true } });
    expect(route.source).toBe('osrm');
    expect(route.mobility.notices).toEqual(['parking_unverified', 'step_free_unverified', 'smoother_unavailable']);
  });

  it('marks straight-line fallbacks as unverified and never fabricates navigable steps', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const route = await routingService.getRoute(from(0.05), to(0.05), { mode: 'fastest', steps: true, mobility: { ...mobility, avoidHighways: true, preferSmootherRoads: true } });
    expect(route.source).toBe('straight-line');
    expect(route.steps).toBeUndefined();
    expect(route.mobility.notices).toEqual(['highways_unavailable', 'route_unavailable']);
  });

  it('keeps existing routes unchanged when no mobility preferences are selected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(0.06)));
    const reports = vi.spyOn(db.roadReport, 'findMany');
    const route = await routingService.getRoute(from(0.06), to(0.06), { mode: 'fastest', mobility });
    expect(route.durationSeconds).toBe(100);
    expect(route.mobility.notices).toEqual([]);
    expect(reports).not.toHaveBeenCalled();
  });
});
