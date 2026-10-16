# Browser session and dependency security implementation plan

> **For agentic workers:** Use subagent-driven development for the independent
> dependency/frontend work and native execution for server integration. Verify
> each task before final independent review.

**Goal:** Fix the known frontend code vulnerabilities and remove browser JWT
storage while preserving all existing application features and native transport.

**Architecture:** Native bearer sessions coexist with application-scoped HttpOnly
browser credentials. Family-specific cookie names and an authoritative server
pointer prevent stale HTTP responses changing the selected login. Metadata binds
every browser action to the login that initiated it.

**Tech Stack:** Expo/React Native, TypeScript, Express, Redis, Prisma, Vitest, Node tests.

**Spec:** `docs/superpowers/specs/2026-10-15-web-security-design.md`.

## Constraints and review focus

Keep email OTP, role checks, native bearer/SecureStore, refresh revocation, the
administrator's eight-hour deadline, location cleanup and idempotency guarantees.
Keep private configuration out of Git. Never send real messages from tests.
Cover late Set-Cookie, offline logout, cross-tab ambient account changes, initial
browser bootstrap races and mutable dependency source drift.

## Task 1: Compatible dependency corrections

- [x] Write and observe failing dependency regressions in
  `tests/frontend-dependency-security.test.cjs` for deep/cyclic ASTs, malformed
  DigestInfo, and repeated malformed percent input, with normal feature controls.
- [x] Add reproducible backports under `security/dependency-patches`, installer/
  verifier `scripts/apply-frontend-security-patches.cjs`, installation/test hooks
  and shared `scripts/metro-config.cjs` verification. Fail on version/hash drift.
- [x] Verify targeted tests, direct Metro entry, reproducibility, and honest audit
  metadata; document provenance and licenses.

## Task 2: Server browser transport

- [x] Write and observe failing `server/tests/web-session.integration.test.ts`:
  token-free DTOs, cookie flags, origin/app/CSRF/session binding, native coexistence,
  stale cookie publication/deletion, rotation, revocation and admin lifetime.
- [x] Add `server/src/modules/auth/webSession.ts`: cookie parsing/context,
  browser slots/mutex, issuance delivery, bootstrap, conditional logout and
  authenticated request/socket validation. The shared DTO fields are exactly
  `transport,userId,sessionId,loginId,expiresAt,csrfToken`.
- [x] Update auth issuance/inspection in `service.ts`, auth routes, middleware,
  credentialed CORS/config and `realtime/socket.ts`; retain native behavior.
- [x] Verify dedicated test database/Redis regressions and independent review.

## Task 3: Browser lifecycle and native compatibility

- [x] Write and observe failing `tests/browser-session.test.cjs` (or equivalent)
  with actual simulated cookie effects, cancellation, logout fences and rotation.
- [x] Add the AuthSession union in contracts and browser lifecycle helper;
  update HTTP/auth store/storage, OTP publication and both realtime hooks.
  Use server bootstrap, in-memory CSRF and app/session/login headers. Persist
  non-secret fences only. Never auto-replay an action for a different login.
- [x] Adapt bearer fixtures explicitly to native and retain privacy/idempotency
  assertions. Verify browser and native regression groups before full checks.

## Task 4: Final verification and runtime

- [x] Run all frontend/server tests, client contracts and TypeScript serially.
- [x] Export customer/management web, build/recreate backend/worker, restart the
  frontends and check readiness plus cookie/CSRF denial without real OTP delivery.
- [x] Scan tracked/proposed files for configured secrets, update the security
  report with raw audit counts, verified mitigations and remaining deployment limits.
- [x] Complete independent final review, save local changes and report exact results.
