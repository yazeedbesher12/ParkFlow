import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../services';
import type { GateScan, OverstayRules } from '@parkflow/contracts';
import { useCurrentUser, useUserId } from './useSession';

export function useIsGateStaff() {
  const { user } = useCurrentUser();
  const role = user?.role;
  const staff = role === 'ADMIN' || role === 'PARKING_OPERATOR' || role === 'ENFORCEMENT_OFFICER';
  const zones = useGateZones(staff);
  const authorized = role === 'ADMIN' || role === 'ENFORCEMENT_OFFICER' || (zones.data?.length ?? 0) > 0;
  return { gate: authorized && (role === 'ADMIN' || role === 'PARKING_OPERATOR'), patrol: authorized && staff };
}

/** Refreshes itself before the two-minute pass expires. */
export function useGatePass(vehicleId?: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['gate-pass', userId ?? 'anonymous', vehicleId ?? ''],
    queryFn: () => services.gates.gatePass(vehicleId!),
    enabled: Boolean(userId && vehicleId),
    refetchInterval: 60_000,
    staleTime: 50_000,
  });
}

export function useGateZones(enabled = true) {
  const userId = useUserId();
  return useQuery({ queryKey: ['gate-zones', userId ?? 'anonymous'], queryFn: () => services.gates.zones(), enabled: enabled && Boolean(userId), retry: false });
}

export function useVisits(zoneId?: string) {
  const userId = useUserId();
  return useQuery({ queryKey: ['gate-visits', userId ?? 'anonymous', zoneId ?? ''], queryFn: () => services.gates.visits(zoneId!), enabled: Boolean(userId && zoneId), refetchInterval: 30_000 });
}

export function useGateScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ direction, scan }: { direction: 'entry' | 'exit'; scan: GateScan }) =>
      direction === 'entry' ? services.gates.entry(scan) : services.gates.exit(scan),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['gate-visits'] }),
  });
}

export function useSaveRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, rules }: { zoneId: string; rules: OverstayRules }) => services.gates.saveRules(zoneId, rules),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['gate-zones'] }),
  });
}

export function usePatrolCheck() {
  return useMutation({ mutationFn: ({ zoneId, plate }: { zoneId: string; plate: string }) => services.gates.patrolCheck(zoneId, plate) });
}

export function usePatrolIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, plate }: { zoneId: string; plate: string }) => services.gates.patrolIssue(zoneId, plate),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['violations'] }),
  });
}
