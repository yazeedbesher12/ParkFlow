import { useSelectedVehicle } from './useVehicles';
import { useUserId } from './useSession';

/** Shared request identity for previews, trip stops and live reroutes.
 * Send the ID only; the server loads the preference and checks account access.
 */
export function useRoutingVehicle() {
  const { selected, isPending } = useSelectedVehicle();
  const userId = useUserId();
  return {
    vehicleId: selected?.id,
    key: `${userId ?? ''}:${selected?.id ?? ''}:${Boolean(selected?.avoidHighways)}`,
    isPending,
  };
}
