# Trusted Parking Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ParkFlow's demo-oriented parking data into a trustworthy, operator-backed parking journey while preserving explicit demo behavior until live inventory is configured.

**Architecture:** Implement dependency-ordered vertical slices. First expose availability provenance and feedback, then add operator operations, then put live inventory behind a provider interface and connect reservations to it. Destination routing, offline behavior, and forecasting consume those stable contracts later. Existing API registry, Prisma, TanStack Query, Expo Router, localization, idempotency, and audit patterns remain the integration points.

**Tech Stack:** React Native/Expo SDK 57, TypeScript, Expo Router, TanStack Query, Zustand, Express 5, Zod, Prisma 6, PostgreSQL, Redis/BullMQ, existing API registry and audit/outbox services.

**Spec:** `docs/superpowers/specs/2026-10-01-trusted-parking-network-design.md`

## Global Constraints

- Prototype zones and demo reservations must remain visibly labeled and must never imply a live guarantee.
- The first pilot uses manually maintained operator feeds; sensor, ANPR, payment-provider, and municipal integrations are extension points.
- All mutations use existing Zod validation, role guards, idempotency keys where applicable, and audit logging.
- New user-facing copy must be added to both `src/i18n/en.ts` and `src/i18n/ar.ts` and must render safely in RTL.
- The client must treat `unknown`, stale, missing, and offline data as valid states.
- No new payment provider or hardware dependency is introduced by this plan.
- The downloaded workspace has no usable Git repository; use verification checkpoints instead of commit steps.

## Review Focus

- A stale or community-only signal must never be surfaced as a guaranteed live space; pin this in provenance and DTO tests (Task 1).
- An operator must not read or mutate a zone outside their assigned operator; pin this in route/service authorization tests (Task 2).
- Two concurrent holds for the same live inventory must produce at most one confirmed reservation; pin this in transaction tests (Task 3).
- Retrying an offline feedback/report request must not create duplicates; pin this in queue tests (Task 5).
- Arabic RTL and absent facility metadata must render without crashes or misleading empty labels; pin this in component tests (Tasks 1 and 4).

---

### Task 1: Availability provenance, freshness, and driver feedback

**Files:**
- Create: `server/prisma/migrations/<timestamp>_parking_feedback/migration.sql`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/modules/parking/service.ts`
- Modify: `server/src/modules/parking/routes.ts`
- Create: `server/src/modules/parking/feedback.ts`
- Create: `server/tests/parking-provenance.test.ts`
- Modify: `src/types/parking.ts`
- Modify: `src/services/types.ts`
- Modify: `src/services/http.ts` (or the existing HTTP service implementation selected by `services/index.ts`)
- Modify: `src/components/map/CompactZoneCard.tsx`
- Modify: `src/components/domain/ZoneSheet.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ar.ts`

**Interfaces:**
- Produce `ParkingAvailabilityProvenance { source, recordedAt, ageSeconds, confidence, freshness, availableSpaces?, occupiedSpaces?, isGuaranteed }` in every zone DTO.
- Produce `POST /parking/zones/:id/feedback` accepting `{ outcome: 'found' | 'not_found' | 'delayed'; delayBucket?: 'under_5m' | '5_15m' | 'over_15m'; sessionId?: string; reservationId?: string }` and returning the created feedback DTO.
- `ParkingService.submitParkingFeedback(input): Promise<ParkingFeedback>` is the client service contract.

- [ ] **Step 1: Add the feedback Prisma model and migration.**

  Add an enum for the three outcomes and a `ParkingFeedback` model linked to the submitting user, zone, and optional session/reservation. Store only a coarse delay bucket, timestamps, and a unique idempotency-safe request identity; do not store a route or precise movement history. Add indexes by zone/time and relations on `User`, `ParkingZone`, `ParkingSession`, and `ParkingReservation`.

- [ ] **Step 2: Write failing provenance and feedback tests.**

  In `server/tests/parking-provenance.test.ts`, assert that a fresh operator snapshot reports `fresh` and `isGuaranteed: false`, a snapshot past the freshness window reports `stale`, community reports are identified as community, missing snapshots report `unknown`, and feedback rejects an invalid outcome and accepts an idempotent valid submission.

- [ ] **Step 3: Implement provenance selection and feedback service.**

  Extract a pure `buildAvailabilityProvenance(snapshot, crowd, now)` helper from `parking/service.ts` with fixed freshness thresholds documented in the test. Return the provenance object from `zoneDto`. Implement `feedback.ts` with ownership checks for optional session/reservation references and idempotent creation.

- [ ] **Step 4: Add the authenticated feedback route and client contract.**

  Register the Zod-validated route in `parking/routes.ts`, use `user(r)` and `key(r)`, add the client type and HTTP implementation, and invalidate the affected zone/query after success.

- [ ] **Step 5: Render provenance in the map and zone sheet.**

  Add a compact badge and accessible detail text for source, freshness, confidence, and guarantee state. Keep the existing availability label, show an explicit demo/estimate message for prototype zones, and render `unknown` without an empty or false claim. Add Arabic and English strings.

- [ ] **Step 6: Run the focused checks.**

  Run the server provenance test, `npm run typecheck` at the root and in `server`, and the Expo web export. Expected result: all pass and the unauthenticated map still renders.

### Task 2: Operator workspace and feed health

**Files:**
- Modify: `server/src/modules/admin/service.ts`
- Modify: `server/src/modules/admin/routes.ts`
- Create: `server/src/modules/operator/service.ts`
- Create: `server/src/modules/operator/routes.ts`
- Create: `server/tests/operator-access.test.ts`
- Create: `app/operator/_layout.tsx`
- Create: `app/operator/index.tsx`
- Create: `app/operator/zones/[id].tsx`
- Create: `src/hooks/useOperator.ts`
- Modify: `src/services/types.ts`
- Modify: `src/services/http.ts` (or the selected HTTP implementation)
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ar.ts`

**Interfaces:**
- `GET /operator/summary` returns assigned zones, latest provenance, active reservation count, and feed-health flags.
- `POST /operator/zones/:id/availability` accepts the existing availability payload plus an optional reason and returns a snapshot DTO.
- `GET /operator/zones/:id/reservations` returns reservations scoped to the operator's zone.
- `POST /operator/reservations/:id/check-in` transitions a confirmed reservation to `checked_in` after scope and time validation.
- `GET /operator/feed-health` returns stale and conflicting signals for assigned zones.

- [ ] **Step 1: Write authorization and feed-health tests.**

  Assert that an assigned operator can read/update their zone, another operator receives `403`, an admin can read all zones, stale feeds are reported, and a conflicting crowd/operator signal is surfaced without changing the source record.

- [ ] **Step 2: Implement operator service boundaries.**

  Add a single `operatorZonePermission` helper that reuses `operatorUser` membership, returns a scoped zone, and is called by every operator mutation/query. Add summary/feed-health calculations and reservation check-in inside audited transactions.

- [ ] **Step 3: Register routes and client hooks.**

  Register the operator routes through the existing API registry and add typed service methods plus TanStack Query hooks with invalidation after availability/check-in mutations.

- [ ] **Step 4: Build the operator screens.**

  Add a role-gated operator home, zone detail with capacity update form, stale/conflict notices, reservation list, and check-in action. Reuse existing cards, buttons, theme, locale, and error states; render read-only guidance when the account is not an operator.

- [ ] **Step 5: Verify.**

  Run operator access tests, server/root typechecks, and a web export. Manually verify Arabic RTL and that an operator never sees another operator's zones.

### Task 3: Inventory provider, live holds, and reservation guarantee state

**Files:**
- Create: `server/src/modules/inventory/types.ts`
- Create: `server/src/modules/inventory/manualProvider.ts`
- Create: `server/src/modules/inventory/service.ts`
- Modify: `server/src/modules/reservations/service.ts`
- Modify: `server/src/modules/reservations/routes.ts`
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_live_inventory/migration.sql`
- Create: `server/tests/reservation-inventory.test.ts`
- Modify: `src/types/reservation.ts`
- Modify: `src/services/types.ts`
- Modify: `src/components/domain/ZoneSheet.tsx`
- Modify: `app/parking/reserve/[zoneId].tsx`
- Modify: `app/parking/reservation/[id].tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ar.ts`

**Interfaces:**
- `InventoryProvider.getAvailability(zoneId, window): Promise<InventoryAvailability>`.
- `InventoryProvider.hold(zoneId, spotId, window, holdKey): Promise<InventoryHold>`.
- `InventoryProvider.release(holdId): Promise<void>`.
- Reservation DTO adds `inventoryMode: 'demo' | 'live'`, `guarantee: 'none' | 'operator_backed'`, and optional `holdExpiresAt`.

- [ ] **Step 1: Add inventory configuration, hold, and reservation metadata.**

  Add provider mode/feed freshness on the zone or facility, a hold model with expiry and unique hold key, and reservation fields for inventory mode, guarantee, check-in time, and operator resolution. Preserve existing demo defaults for seeded zones.

- [ ] **Step 2: Write concurrency tests first.**

  Assert that two overlapping live holds for one spot yield one success, expired holds can be reused, a demo zone stays demo, an operator-backed fresh feed can be guaranteed, and a stale feed cannot be guaranteed.

- [ ] **Step 3: Implement the manual provider and transactional reservation flow.**

  Use the existing database lock/idempotency helpers. Resolve demo spots through the current layout only when the zone is demo; resolve live spots through the provider, create a short hold, then confirm atomically. Release or expire holds in the existing worker maintenance path.

- [ ] **Step 4: Add check-in and overbooking recovery.**

  Extend operator check-in to consume a valid QR/plate, transition the reservation, and record the event. Add a user-visible alternative/refund state without charging the development provider.

- [ ] **Step 5: Update mobile reservation copy and controls.**

  Show live guarantee details only for live reservations, retain the existing demo disclaimer for prototype data, and surface hold expiry/check-in state in reservation details.

- [ ] **Step 6: Verify.**

  Run inventory/reservation tests, server typecheck/build, root typecheck, and web export. Confirm existing demo reservation flows still work.

### Task 4: Destination journey and return-to-car

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_facility_navigation/migration.sql`
- Modify: `server/src/modules/routing/service.ts`
- Modify: `server/src/modules/parking/service.ts`
- Create: `server/tests/destination-score.test.ts`
- Modify: `src/types/routeDestination.ts`
- Modify: `src/types/parking.ts`
- Modify: `src/services/types.ts`
- Modify: `src/components/map/NearbyParkingPanel.tsx`
- Modify: `src/components/domain/ZoneSheet.tsx`
- Modify: `app/(tabs)/map.tsx`
- Create: `app/parking/return.tsx`
- Modify: `src/store/reservationRouteStore.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ar.ts`

**Interfaces:**
- `scoreParkingOption({driveSeconds, walkMeters, price, provenance, accessibility, evCompatible})` returns a deterministic breakdown and total score.
- `GET /parking/facilities/:id/navigation` returns optional entrances, exits, levels, and walking destinations.
- Local return-to-car state stores a zone/facility, saved location, entrance, floor, and user note without claiming indoor positioning.

- [ ] **Step 1: Write score and missing-metadata tests.**

  Assert deterministic ordering for time/price/confidence tradeoffs, safe handling of unknown walk/accessibility values, and no crash when a facility has no entrances.

- [ ] **Step 2: Implement destination metadata and score DTOs.**

  Extend only structured facilities that have verified metadata; return optional fields for others. Keep OSRM driving routes as the current source and expose walking distance as an optional second leg.

- [ ] **Step 3: Add the mobile destination and return flow.**

  Update nearby cards and zone sheet with score reasons, add entrance/parking-note capture, persist the return state, and provide a return screen with external walking/navigation handoff.

- [ ] **Step 4: Verify.**

  Run destination tests, typechecks, web export, and an Arabic RTL smoke check with missing facility metadata.

### Task 5: Offline cache and retry queue

**Files:**
- Create: `src/offline/storage.ts`
- Create: `src/offline/retryQueue.ts`
- Create: `src/offline/types.ts`
- Modify: `src/services/http.ts` (or selected HTTP implementation)
- Modify: `src/hooks/useRoadReports.ts`
- Modify: `src/hooks/useParking.ts`
- Modify: `src/hooks/useReservations.ts`
- Create: `src/offline/retryQueue.test.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ar.ts`

**Interfaces:**
- `OfflineStorage.get<T>(key): Promise<T | undefined>` and `set<T>(key, value): Promise<void>`.
- `RetryQueue.enqueue(item): Promise<void>`, `flush(): Promise<FlushResult>`, and a stable idempotency key per mutation.

- [ ] **Step 1: Write queue tests.**

  Assert FIFO behavior, duplicate idempotency keys collapse to one request, failed requests remain queued, successful retries are removed, and live reservation/payment mutations are rejected while offline.

- [ ] **Step 2: Implement storage and queue.**

  Use the existing Expo-compatible storage dependency or add the smallest already-supported adapter. Store cached map metadata, reservation QR, selected vehicle, route summary, and pending report/feedback payloads with schema versions.

- [ ] **Step 3: Integrate cache and app-resume flush.**

  Read cached values when queries are unavailable, mark them stale in UI, enqueue only reports/feedback, and flush on network regain/app resume. Keep mutation errors visible and localized.

- [ ] **Step 4: Verify.**

  Run queue tests, root typecheck, web export, and a browser smoke test that toggles offline behavior without presenting a false reservation success.

### Task 6: Forecasting and partner analytics

**Files:**
- Create: `server/src/modules/forecasting/service.ts`
- Create: `server/src/modules/forecasting/routes.ts`
- Create: `server/tests/forecasting.test.ts`
- Modify: `server/src/modules/parking/service.ts`
- Modify: `server/src/modules/admin/service.ts`
- Create: `app/operator/analytics.tsx`
- Modify: `src/types/parking.ts`
- Modify: `src/services/types.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ar.ts`

**Interfaces:**
- `GET /parking/zones/:id/forecast?arrivalAt=<ISO>` returns `probability`, `window`, `confidence`, `sampleSize`, and `reasonCodes`.
- Forecasts fall back to provenance when sample size is below the configured minimum; the client displays the fallback state.

- [ ] **Step 1: Write sparse-data and deterministic forecast tests.**

  Assert that insufficient history returns a fallback, the same historical input gives the same result, the probability is bounded 0–1, and demo zones cannot expose a live guarantee through the forecast.

- [ ] **Step 2: Implement an explainable baseline.**

  Aggregate verified snapshots, operator updates, and coarse feedback by local weekday/time buckets. Return reason codes and sample size; avoid an opaque model or external service.

- [ ] **Step 3: Add partner analytics.**

  Expose scoped occupancy trend, reservation conversion, feedback, and feed-quality summaries to operators, reusing the existing role checks and audit conventions.

- [ ] **Step 4: Add mobile/operator presentation and verify.**

  Add forecast copy with confidence and fallback states, run forecasting tests, all typechecks, and web export.

### Task 7: Full integration verification and release checklist

**Files:**
- Modify: `README.md`
- Modify: `EMAIL_OTP.md` if setup instructions change
- Create: `server/tests/trusted-parking.integration.test.ts`
- Create: `docs/superpowers/plans/2026-10-01-trusted-parking-network-verification.md`

- [ ] **Step 1: Add end-to-end API coverage.**

  Exercise operator update → provenance → reservation hold → QR check-in → feedback → forecast fallback through the real route registry against the test database.

- [ ] **Step 2: Run the complete verification set.**

  Run root and server typechecks, focused and integration tests, Prisma migration validation, and Expo web export. Record exact commands and results in the verification checklist.

- [ ] **Step 3: Verify the user flows.**

  Smoke test unauthenticated map, Arabic RTL, demo reservation disclosure, operator scope, stale data, offline queue recovery, and live-provider guarantee gating.

- [ ] **Step 4: Update operational documentation.**

  Document pilot operator setup, provider modes, freshness thresholds, demo/live semantics, and the required environment variables without committing secrets.

## Execution order

Execute Tasks 1–3 in sequence because the operator and inventory contracts depend on provenance. Task 4 can follow Task 1 and consume its DTOs. Task 5 can run after the client mutation contracts exist. Task 6 depends on feedback and provenance history. Task 7 is the final gate.

## Self-review

- **Spec coverage:** Product intent is covered by Tasks 1–6; verification and success measures are covered by Task 7. Demo/live separation appears in Tasks 1 and 3.
- **Step scan:** Each step has one deliverable and a command or test outcome; no step is left as “handle edge cases” or “add appropriate validation.”
- **Type consistency:** Provenance and feedback are introduced in Task 1, operator APIs consume them in Task 2, inventory returns explicit demo/live fields in Task 3, and later tasks consume optional navigation/offline/forecast fields.
- **Review focus:** All five failure modes in the header have an owning task and named assertions.
- **Proportion:** The plan is staged and file-specific without prescribing implementation bodies that the existing patterns already determine.
