# Platform management implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Checkboxes record verification, not just code creation.

**Goal:** Deliver safe operational administration, scoped owner management, and a versioned appearance editor for the approved ParkFlow pilot.

**Architecture:** Extend the existing Express/Prisma API and Expo application. Centralize operator action permissions; preserve financial and reservation history. Store immutable content revisions with an atomic publication pointer. Real SMS/payment providers and production hosting remain external acceptance dependencies, not simulated successes.

**Tech stack:** TypeScript, Express, PostgreSQL/Prisma, Redis, Expo/React Native, TanStack Query, Zod.

**Spec:** ../../reviews/2026-10-07-launch-readiness.txt (approved by user: نعم ابدا).

## Constraints

- SMS follow-up is suspended. No live sends, changed Twilio credentials or weakened OTP controls.
- User explicitly authorized starting; proceed with implementation in this session without repeating design approval.
- Existing directory is an extracted project, not a Git checkout. Work in place; use additive migrations and retain the plan/verification ledger instead of inventing commits.
- All DB tests use the existing guarded `_test` database and Redis DB 15, one runner at a time. Never print secret environment values.
- Root owns schema/migrations/API registration and shared navigation; workers own distinct modules/screens.
- Arabic and English copy, backend object authorization, conflict errors, audited mutations, no arbitrary code in editable content.
- Do not erase data/history. New capabilities must remain usable with existing records.

## Review focus

1. Owner A attempts to alter Owner B's zone through either admin or management routes: deny.
2. A full/unknown/stale lot and concurrent reservations for the last vacancy: no overbooking.
3. A guessed plate does not authorize viewing violations/photos/permits; normal parking remains possible.
4. A stale editor overwrites a later edit or publishes a draft with unsafe URLs: reject and preserve published state.
5. Archive/closure/rate changes encounter existing bookings: no silent loss or repricing.

## Task 1 — Physical vacancy and reservation integrity

Files: server/src/modules/inventory/manualProvider.ts; server/src/modules/reservations/service.ts; server/tests/reservation-inventory.test.ts.

Interface: keep InventoryProvider unchanged. `holdInTransaction` also checks zone-wide capacity using the latest explicit operator vacancy, overlapping commitments, and checked-in timestamps. Allocation tokens do not claim physically observed bay assignments.

- [x] Add regressions for full, no explicit counts, contradictory counts, concurrent last vacancy, existing checked-in cars reflected in a snapshot, and 500-token cap.
- [x] Run the inventory test file and confirm new assertions fail before implementing.
- [x] Implement vacancy reconciliation and zone-wide transactional lock; preserve hold replay and same-spot conflict checks.
- [x] Re-run tests, inspect the cross-zone and replay cases.

## Task 2 — Verification of vehicle access and report privacy

Files: server/prisma/schema.prisma; new migration; modules/vehicles/service.ts; modules/violations/service.ts; modules/roads/service.ts; new modules/vehicleVerification/{routes,service}.ts; app/admin/vehicles.tsx; relevant shared vehicle types; server/tests/vehicle-verification.test.ts.

Interfaces: UserVehicle.verifiedAt nullable; self-added associations have role driver and verifiedAt null. Admin grants/revokes verification with a reason and audit event. Verified access is required for enforcement information and permits; personal parking sessions remain scoped to the requesting account.

- [x] Add regression tests proving a first plate claimant cannot read sensitive enforcement information, another user can request association without taking ownership, and admin verification is scoped and audited.
- [x] Confirm failures, then separate association from verification and add admin review UI.
- [x] Remove stable reporter IDs from legacy public report DTOs and test the response shape.
- [x] Update fixtures to explicitly identify verified access when their scenario requires it; keep negative tests unverified.

## Task 3 — Admin and owner operating portal

Files: new modules/management/{permissions,schema,service,routes}.ts; modules/admin/* and operator/*; new src/types/management.ts; src/services/http/managementService.ts; src/components/management/*; app/admin/manage.tsx; app/operator/manage.tsx; server/tests/management.test.ts.

Interfaces: OperatorUser.memberRole owner/manager/attendant (existing default manager). `operatorPermission(tx,actor,operatorId,action)` and `zonePermission(tx,actor,zoneId,action)` where actions are read/operate/edit/staff/finance/create. ParkingZone version/lifecycle/metadata; ParkingClosure dated intervals. Root registers routes and applies schema.

- [x] Tests: unrelated owner denied, attendant cannot edit price/location or staff, stale version rejected, occupied zone cannot be archived, rate snapshots preserved, closure conflicts rejected, owner draft requires admin publication.
- [x] Confirm failing tests; implement shared permission gate on old and new endpoints. Derive availability source from actor, never user input.
- [x] Build usable bilingual forms: zones/details/rates/week hours/closures, operators/membership, lifecycle submission/publication/archive, operational reports.
- [x] Enforce closures when creating/extending sessions and creating reservations, including timezone/date boundaries.
- [x] Run management/admin/operator tests and client/server typechecks.

## Task 4 — Appearance and content editor

Files: new modules/appConfig/{schema,service,routes}.ts; AppConfigRevision/State migration; src/types/appConfig.ts; src/services/http/appConfigService.ts; src/store/appConfigStore.ts; app/admin/appearance.tsx; src/theme/ThemeProvider.tsx; app/(onboarding)/welcome.tsx; app/_layout.tsx; tests/app-config.test.ts.

Interfaces: GET /app-config returns `{version,revisionId,config}`; authenticated ADMIN reads history, PATCH draft, POST publish and rollback. Config schema version1 permits bounded localized app name/headline/body/banner, hex brand color, HTTPS images, and an ordered list of known blocks/actions. Revisions are immutable; state version protects publication.

- [x] Tests: public sees only published config, ordinary user denied, unsafe URL/action/overlong text rejected, stale version rejected, rollback creates an audited publication preserving history.
- [x] Confirm RED, implement service and defaults.
- [x] Build editor with preview, save, publish, history/rollback; consume published config in welcome/theme with safe offline defaults.
- [x] Run config tests and client/server typechecks.
- [ ] Inspect browser UI at narrow and wide sizes (blocked by browser URL policy on the crashed tab).

## Task 5 — Payment retry and dependency hardening

Files: src/services/http/walletService.ts; hooks/payment retry state and top-up UI; dependency lockfiles; tests for persisted recovery.

- [x] Test persistence of one logical top-up across remount/retry, reject payload mismatch, clear only on a definitive result; implement without sending a real payment.
- [x] Audit current production lockfile dependencies, apply compatible patches only, inspect remaining reachable risks. Never force a downgrade of Expo to satisfy an advisory resolver.
- [x] Keep production card SDK/gateway integration explicitly unconfigured until a provider is supplied; no fake paid-success path.

## Task 6 — Integration and verification

- [x] Register routes, add portal links in admin/operator, generate Prisma client and apply additive migrations to the test DB first.
- [x] Run full backend suite, client and server typechecks, auth-flow/offline tests where affected.
- [x] Perform scoped review of permissions, transaction boundaries, publish state and UI error handling; fix material findings.
- [x] Apply reviewed additive migrations to local running app, rebuild/restart backend/worker and check /ready. Preserve local data.
- [ ] Exercise admin/owner/user journeys in local browser without SMS; record what was and was not tested.
- [x] Update ledger and final report with actual results and remaining production dependencies.

## Execution ledger

- Started 2026-10-07 after explicit approval. Parallel workers: inventory, management, appearance. Root: vehicle/privacy, shared migrations, payment/dependencies, integration.
- Interface scan: tasks1/3 share reservation closure policy; task3 owns closure mutation, task1 applies check on reservation creation, root applies session checks. Tasks2/3 share admin vehicle grant; task3 marks verifiedAt only for deliberate admin grant. Task4 consumes root-owned additive schema and API registration. No worker edits secret files.
- Final combined backend run: `npm test -- --reporter=dot`, 24 files / 293 tests passed, 275.57 seconds, recorded in docs/reviews/2026-10-07-full-tests.log. Earlier run was interrupted when Docker restarted and is not counted.
- Root client tests: `node --test tests/*.test.cjs`, 9/9 passed. Backend typecheck passed. Expo compatible patch versions aligned; `expo install --check` passed. Web export with `--max-workers 1` passed (3654 modules); default worker count had exhausted memory. Leaflet CSS asset URL warnings remain; no visual QA is claimed.
- Independent review fixes include hours GET-to-save serialization, mixed owner/attendant financial scope, archived closure mutation, post-publish refresh race, resumed payment receipt amount, future authoritative reservation quotes and cancellation/check-in race, verified-only violation notifications and legacy evidence-reason grant policy.
- Final audit snapshots: client 30 (19 high, 11 moderate); server 2 moderate, no high/critical. Compatible patches only, no force downgrade. See saved JSON and implementation-security.txt for interpretation and production gates.
- Before local migration, pg_dump completed and pg_restore succeeded in an isolated temporary database with 44 public tables. Temporary database removed; private local backup retained under server/.backups and excluded from Git/Docker context.
- Docker recovery hardening: PostgreSQL/Redis restart unless stopped, backend readiness healthcheck, worker waits for healthy backend. No data volumes deleted.
- Local runtime accepted: backend/worker images built separately, additive migration 20261007020000_platform_management applied to application DB. `/ready` returns ready; public config returns default version 0; anonymous management/config-admin/vehicle-verification requests return 401. Backend/PostgreSQL/Redis/Minio healthy and worker running. Metro serves localhost/127.0.0.1:8081. Final client typecheck passed after all UI changes. Browser visual acceptance remains open; SMS remains suspended.
