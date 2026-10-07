# ParkFlow Trusted Parking Network

## Status

Design approved in chat on 2026-10-01. Implementation is intentionally staged so demo inventory is never presented as guaranteed live capacity.

## Product intent

ParkFlow should help a driver choose a parking option near a destination, understand how reliable the availability signal is, reserve only when the inventory is trustworthy, reach the correct entrance, and find the car again afterward. The supply side should give parking operators a small, dependable workspace for capacity, pricing, reservations, and data health.

The first operational pilot assumes manually maintained operator feeds in Ramallah and Al-Bireh. Sensor, ANPR, payment-provider, and municipal integrations are extension points; they are not prerequisites for the first usable vertical slice.

## Existing foundations

- `ParkingZone` already stores operator ownership, capacity, prototype status, entry methods, tariffs, and operating hours.
- `AvailabilitySnapshot` already stores availability, counts, source, confidence, and timestamp.
- `ParkingReport`, points, and trust profiles provide a starting point for user feedback and source calibration.
- Admin routes already support zone, tariff, hours, and availability changes, with audit logging.
- Reservations already have QR tokens, idempotency, overlap locking, cancellation, and demo flags, but currently resolve spots from a static demo layout.
- The mobile map already supports nearby zones, OSRM driving routes, community reports, EV stations, Arabic/English localization, and active parking sessions.

## Recommended approach

Three approaches were considered:

1. **Build every feature in parallel.** This provides a broad demo quickly but leaves the data contract and live inventory semantics ambiguous.
2. **Build vertical slices in dependency order.** Each slice becomes usable and testable before the next one depends on it. This is the recommended approach.
3. **Polish the mobile UI first.** This improves screenshots while leaving the current demo reservation and stale-data problem unresolved.

The implementation will follow option 2.

## Staged scope

### Stage 1: Availability provenance and driver feedback

Extend the zone DTO with a stable availability provenance object:

- `source`: operator, admin, sensor, ANPR, or community.
- `recordedAt` and `ageSeconds`.
- `confidence` and a derived `freshness` state (`fresh`, `aging`, `stale`, `unknown`).
- `availableSpaces` and `occupiedSpaces` when supplied.
- `isGuaranteed`: false for snapshots and reports until an operator-backed inventory is enabled.

The server will choose the freshest eligible signal while retaining the underlying source and age. Community reports will remain useful but visibly separate from operator or sensor data. The mobile map and zone sheet will show a compact confidence badge and a detail view explaining the signal in Arabic and English.

After a parking session or reservation, the driver can submit a short result: found a space, did not find one, or found one after a delay. The server will store this against the zone and use it to calibrate reporting confidence without exposing personal movement history.

### Stage 2: Operator workspace and feed health

Add operator-facing screens backed by the existing `PARKING_OPERATOR` role:

- assigned zones and current capacity;
- one-click availability update with optional counts and reason;
- tariff and operating-hours status;
- reservation and check-in list;
- stale-feed and conflicting-signal alerts;
- audit history and a small daily performance summary.

Add server endpoints for operator summary, feed health, reservation check-in, and reconciliation. Existing admin CRUD remains available for administrators. Every operator mutation writes an audit record and carries the operator identity.

### Stage 3: Live inventory and reservation guarantee

Introduce an inventory abstraction behind the current static layout:

- manual inventory provider for the pilot;
- future sensor/ANPR providers using the same interface;
- atomic short holds before confirmation;
- reservation overlap checks against inventory and existing reservations;
- explicit `demo` versus `live` reservation responses;
- QR and plate check-in;
- operator cancellation or overbooking recovery with an alternative and refund path.

Live guarantees will only be shown when the zone has an enabled operator inventory provider and a fresh feed. Prototype zones will remain bookable only under the existing demo rules and will be labeled accordingly.

### Stage 4: Destination journey and offline support

Add a destination score combining driving time, walking distance, price, confidence, accessibility, and EV suitability. Extend facility data with entrances, exits, levels, and walking destinations where available. The driver flow will save the entrance and optional floor/spot note, provide a return-to-car action, and issue a reminder based on the session end time.

Cache the latest map metadata, reservation QR, selected vehicle, and route summary locally. Reports created offline enter a retry queue and show their pending state until accepted by the server. No offline action will claim a live reservation or payment success.

### Stage 5: Forecasting and partner analytics

Once enough pilot data exists, add a clearly labeled probability estimate for availability by arrival time. The estimate will expose its time window and confidence and will fall back to current provenance when data is insufficient. A partner dashboard can then add occupancy trends, reservation conversion, and data-quality metrics.

## Data and API changes

The Prisma migration will add only fields needed by the stages being implemented. The likely additions are:

- provenance/freshness metadata and an optional provider key for availability snapshots;
- a `ParkingFeedback` record linked to a user, zone, session or reservation, with coarse outcome and delay bucket;
- inventory-provider configuration and feed-health state on a zone or facility;
- reservation hold/check-in metadata and a guarantee state;
- facility entrance and walking-destination records where the current JSON layout cannot represent them.

All new endpoints will use the existing API registry, Zod validation, role guards, idempotency keys for mutations, and audit logging. DTOs will preserve the current Arabic/English naming pattern and will never infer a guarantee from a demo record.

## Mobile behavior

The first UI pass will update existing map cards and `ZoneSheet` rather than introduce a competing map flow. New screens should be reachable from the current map and reservation flows, use the existing theme and localization system, and render safely when a field is unknown. Operator screens can initially be web-compatible React Native routes; they do not require a separate frontend application.

## Verification

Each stage must pass the root typecheck and web export, server typecheck/build, focused unit tests for freshness and inventory rules, and API tests for authorization and idempotency. Reservation tests must cover demo zones, live zones, overlapping holds, expired holds, check-in, cancellation, and overbooking recovery. Mobile verification will include Arabic RTL, stale/unknown data, offline queue recovery, and a clean unauthenticated state.

## Explicit non-goals for the first pilot

- Purchasing or depending on physical ANPR, barrier, or sensor hardware.
- Claiming exact live spaces for seeded demo locations.
- Adding a new payment provider without credentials and webhook contracts.
- Building a broad social feed or an AI assistant before the reliability loop is measured.

## Success measures

The pilot will track successful reservation/check-in rate, stale-data rate, driver-reported time to find a space, feedback completion, operator update frequency, alternative-offer success, and repeat use. App downloads alone will not be used as the primary success signal.
