import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';

export function useOperatorSummary() { return useQuery({ queryKey: ['operator','summary'], queryFn: () => services.operator.summary() }); }
export function useOperatorReservations(zoneId?: string) { return useQuery({ queryKey: ['operator','reservations', zoneId], queryFn: () => services.operator.listReservations(zoneId!), enabled: Boolean(zoneId) }); }
export function useOperatorAvailability() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ zoneId, ...input }: { zoneId: string; availability: 'available'|'limited'|'full'|'unknown'; availableSpaces?: number; occupiedSpaces?: number; confidence: number; reason?: string }) => services.operator.updateAvailability(zoneId, input), onSuccess: () => { void client.invalidateQueries({ queryKey: ['operator'] }); } });
}
export function useOperatorCheckIn() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ reservationId, qrToken }: { reservationId: string; qrToken?: string }) => services.operator.checkIn(reservationId, qrToken), onSuccess: () => { void client.invalidateQueries({ queryKey: ['operator'] }); } });
}
export function useOperatorRecovery() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, resolution, note }: { reservationId: string; resolution: 'alternative' | 'refund_requested'; note?: string }) => services.operator.resolveReservation(reservationId, { resolution, note }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['operator'] }); },
  });
}
