# Trusted parking verification checklist

## Fresh checks

- `npm run typecheck` (root): PASS after final integration fixes.
- `server/npm run typecheck`: PASS after final inventory freshness fix and Prisma client generation.
- `npx prisma validate --schema prisma/schema.prisma`: PASS.
- `server/npm test -- tests/parking-provenance.test.ts`: blocked during test setup when PostgreSQL/Redis are unavailable at the configured local ports; Vitest refuses non-`_test` databases.
- `server/npm test -- tests/operator-access.test.ts`: same environment block.
- `server/npm test -- tests/reservation-inventory.test.ts`: test file transforms, then setup is blocked by PostgreSQL/Redis availability; no runtime behavior is claimed.
- `server/npm test -- tests/destination-score.test.ts`: pure score cases are present; the shared server setup still requires the test database and Redis.
- `server/npm test -- tests/forecasting.test.ts`: pure baseline cases are present; the shared server setup still requires the test database and Redis.
- `npx expo export --platform web`: PASS; web bundle exported to `dist` (3,626 modules).

## Manual smoke checklist

1. Open the map as English and Arabic. Unknown or stale provenance must show an estimate/no-guarantee state.
2. Open an assigned operator workspace. A non-operator receives access guidance; another operator's zones are absent.
3. Update a zone availability state, reason, and counts; verify feed health and conflict messaging.
4. For a live zone with positive capacity, reserve a space twice concurrently; only one active hold/reservation may win. A demo zone remains visibly demo.
5. Validate a reservation QR at the operator endpoint, check in within the window, and verify `checkedInAt` plus the audit record. Use recovery only to record an alternative or refund request.
6. Save a return-to-car location, choose a facility entrance when metadata is available, add floor/note/reminder, close/reopen the app, and verify the persisted state, local reminder permission flow, and external maps handoff.
7. Turn off the network, submit a road report or parking feedback, then restore connectivity. Confirm FIFO retry with the same idempotency key and no false server-success UI. Reservation/payment actions remain unavailable offline.
8. Open the forecast with sparse history. Verify a bounded estimate with an explicit fallback reason; demo data never becomes a live guarantee.

## Environment limitation

The current workspace has PostgreSQL 17 installed as a Windows service, but the project is configured for Docker-style ports `5434` and `6381`; Docker Desktop was unavailable during this run. Runtime/database assertions remain pending until those services are started.
