# Vehicle-aware routing preferences

The optional Arabic/English switch appears in the shared add-vehicle form
(including onboarding) and the existing vehicle detail/settings screen. It defaults
to OFF and explains that it is a driver preference, not a roadworthiness assessment.

`avoidHighways` belongs to the authenticated driver's `UserVehicle` link. Other
drivers sharing a car retain their own preferences. Existing vehicle creation,
access checks, update authorization, authentication and route rate limits remain
in place. The strict add/update schemas accept only a boolean; omitted PATCH fields
preserve the saved value. Route requests accept an optional `vehicleId` and check
the caller's active link before loading the saved preference.

The routing endpoint ORs this preference with the existing consented health
highway preference without writing or changing the health profile. Without a
vehicle ID the prior health-aware behavior is retained. Walking does not request
motorway exclusion.
Traffic enrichment from a separate unrestricted Google route is omitted when
OSRM exclusion succeeds, so unrelated traffic geometry cannot imply a compliant
route. Other traffic behavior is retained.

Preview queries, trip-need legs and navigation reroutes share `useRoutingVehicle`
for vehicle identity. Query keys include identity and the saved setting. Trip plans
are tagged with that identity, and navigation invalidates old requests and starts
fresh guidance on a driving vehicle change, retaining remaining stops.

The existing OSRM integration requests `exclude=motorway`, keeps excluded geometry
in a separate cache, and retries without the heading constraint while preserving
exclusion. Only a successful excluded response is reported as applied. Unsupported
classes, provider errors/timeouts and no-route responses trigger the existing
localized `highways_unavailable` warning before unrestricted fallback. If neither
request succeeds, the approximate route also carries `route_unavailable`; it cannot
start turn guidance. Live navigation retains returned mobility notices even when
guidance cannot be built. Combined trip routes aggregate notices across all legs
and report exclusion applied only when every leg does.

The route panel offers each returned alternative, its provider duration/distance,
and signed differences relative to the first displayed route. Selection updates
the map and initial navigation route. No unrestricted comparison is presented as
an excluded alternative. Alternatives depend on the provider (OSRM does not offer
them for multi-stop requests).

## Configuration and migration

- Prepare/regenerate the Prisma client from the updated schema before running the
  changed backend. This has not been run during this task.
- Review and apply `server/prisma/migrations/20261106000000_vehicle_routing_preference/migration.sql`
  through the normal deployment process. It adds a non-null boolean with a false
  default to `user_vehicles`; no migration has been applied here.
- No dependencies, keys or new environment variables are needed. `OSRM_BASE_URL`
  must point to an OSRM driving deployment whose prepared profile supports the
  motorway exclusion class for avoidance to work. Capability is determined from
  each actual exclusion request, not inferred from the hostname.
- OSRM documents the profile-specific exclusion classes and `exclude=motorway`:
  https://project-osrm.org/docs/v5.24.0/api/#general-options
  Success depends on that provider's implementation and map data. The live
  deployment's capability and geographical coverage have not been verified.

## Manual verification after migration and client generation

1. In Arabic and English, add a vehicle; confirm OFF by default and the explanatory
   text. Enable it, save, reopen its details, change it and restart the app to check
   persistence. Confirm older vehicles display OFF.
2. Route with vehicle A ON and B OFF. Inspect `/routes/plan` vehicle IDs and the
   provider's `exclude=motorway` query. With health avoidance ON and vehicle OFF,
   confirm exclusion remains ON; repeat with vehicle ON and health OFF. Verify
   other health switches and walking remain effective. With no linked vehicles,
   check the existing health-only behavior.
3. Where alternatives exist, compare displayed time/distance and signed differences,
   select each, and start navigation. Check the chosen geometry/steps are used.
4. Delay route responses and rapidly switch A/B while previewing, planning trip
   stops and navigating. Confirm old results do not replace current routes and
   navigation retains the remaining stops. Edit the selected car's switch and
   return to the map to confirm replanning.
5. Use an unsupported exclusion class deployment, simulate provider failure, and
   return no excluded route. Confirm the localized warning remains visible on
   unrestricted fallback and during navigation. Fail both requests and confirm
   approximate/no-guidance behavior and notices. Check a mixed-success trip plan
   never claims all legs excluded highways.
6. Submit a string for `avoidHighways` and another account's/unlinked vehicle ID;
   confirm rejection. Check two authorized drivers of a shared car retain
   independent settings. Spot-check road reports, parking, warning-photo analysis
   and accessibility preferences.

Only static source/diff review was performed. No tests, builds, browser automation,
database operations, commits, pushes or deployment were performed.

## Changed files

- Vehicle UI: `src/components/domain/VehicleForm.tsx`, `app/vehicles/[id].tsx`.
- Vehicle contracts/cache: `src/types/vehicle.ts`, `src/services/types.ts`,
  `src/services/vehicleService.ts`, `src/hooks/useVehicles.ts`.
- Routing requests: `src/types/road.ts`, `src/hooks/useRoutingVehicle.ts`,
  `src/hooks/useCommunity.ts`, `src/hooks/useTurnByTurnNavigation.ts`,
  `src/utils/tripNeedsRouting.ts`, `app/(tabs)/map.tsx`.
- Route presentation: `src/components/map/CompactRoutePanel.tsx`,
  `src/components/map/navigation/NavigationOverlay.tsx`, `src/i18n/ar.ts`, `src/i18n/en.ts`.
- Backend: `server/src/modules/vehicles/routes.ts`, `server/src/modules/vehicles/service.ts`,
  `server/src/modules/roads/routes.ts`, `server/src/modules/routing/service.ts`.
- Storage/configuration: `server/prisma/schema.prisma`,
  `server/prisma/migrations/20261106000000_vehicle_routing_preference/migration.sql`,
  `server/.env.example`, and this document.
