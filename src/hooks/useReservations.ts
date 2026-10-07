import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import type { CreateParkingReservationInput, ParkingReservationSelection } from '@/types';
import { queryKeys } from './queryKeys';
import { useUserId } from './useSession';
import { cachedRead } from '@/offline/storage';

/** Quotes always come from the server and are never served from offline storage. */
export function useReservationQuote(input: ParkingReservationSelection, zoneVersion?: number) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['reservation-quote', userId, input.zoneId, input.startTime, input.durationMinutes, zoneVersion],
    queryFn: () => services.parking.quoteReservation(input),
    enabled: Boolean(userId && input.zoneId),
    staleTime: 0,
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
  });
}

export function useReservations() {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.reservations(userId ?? 'anonymous'),
    queryFn: () => cachedRead(userId!, 'reservations', () => services.parking.listReservations()),
    enabled: Boolean(userId),
  });
}

export function useReservation(reservationId?: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.reservation(reservationId ?? ''),
    queryFn: () => cachedRead(userId!, `reservation.${reservationId!}`, () => services.parking.getReservation(reservationId!)),
    enabled: Boolean(userId && reservationId),
  });
}

function useReservationInvalidation() {
  const queryClient = useQueryClient();
  return (id?: string, parkingId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.reservation(id) });
    if (parkingId) void queryClient.invalidateQueries({ queryKey: queryKeys.parkingLayout(parkingId) });
  };
}

export function useCreateReservation() {
  const invalidate = useReservationInvalidation();
  return useMutation({
    mutationFn: (input: CreateParkingReservationInput) => services.parking.createReservation(input),
    onSuccess: (reservation) => invalidate(reservation.id, reservation.parkingZoneId),
  });
}

export function useCancelReservation() {
  const invalidate = useReservationInvalidation();
  return useMutation({
    mutationFn: (reservationId: string) => services.parking.cancelReservation(reservationId),
    onSuccess: (reservation) => invalidate(reservation.id, reservation.parkingZoneId),
  });
}
