# Separate Frontends Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the migration and delegate independent test adaptation/review where useful. Track steps below.

**Goal:** Independently runnable customer and management frontends in one repository, preserving features and using the same server/database.

**Architecture:** Two Expo app workspaces own their routes and specialized components. Shared contracts, design and client packages own platform-neutral/shared functionality, with per-application runtime and storage isolation. The existing server stays standalone.

**Tech Stack:** Existing Expo 57, React Native/web, TypeScript, npm workspaces, Express/Prisma.

**Spec:** `docs/superpowers/specs/2026-10-14-separated-frontends-design.md`

## Global Constraints

- Preserve every existing customer/admin/operator feature and backend authorization.
- Keep current SDK/dependency versions, database/schema and financial data unchanged.
- Customer 8081, management 8082, API 4000; preserve existing service ports.
- No private environment values, tokens, backups or diagnostics in Git.
- Shared packages must not import either application's source.
- Independent session families/caches; preserve customer legacy persisted keys.

## Review Focus

- A completed administrator using customer must land on the map, never a removed route.
- An ordinary account using management must not mount privileged query screens.
- Management login/logout/hydration must not overwrite a same-origin customer session.
- Profile completion/header-back/deep links must remain inside the correct app.
- Every original privileged route/action and every customer platform bundle must survive.

### Task 1: Pin routing and session boundaries with failing regressions

**Files:** `tests/auth-flow.test.cjs`, new `tests/application-session.test.cjs` and test loader helper.
**Interfaces:** `authLanding(user, application)` returns customer map or permitted management destination; app storage adapter isolates keys over the same storage boundary.

- [x] Add explicit customer/management role/profile assertions to the existing landing test.
- [x] Add a real auth-store/storage test for independent login/hydration/logout over common storage.
- [x] Run new tests against the original implementation; observe wrong landing/shared-session failure.

### Task 2: Move application ownership and expose shared packages

**Files:** root/workspace package manifests and locks; `apps/customer`, `apps/management`, `packages/contracts`, `packages/design`, `packages/client`; existing app/src/config/assets files.
**Interfaces:** explicit package exports map original imports to their new owning package; each app resolves `@/` only to its own source.

- [x] Map original tracked frontend paths to new owners before moving; preserve all files/features.
- [x] Move customer and privileged routes/components; move shared source/types/tokens/assets once.
- [x] Rewrite imports including relative imports, dynamic imports and type imports to valid owners.
- [x] Configure independent Expo/Metro/Babel/TypeScript app roots and npm workspace commands.
- [x] Regenerate/install workspace lock using existing dependency versions.
- [x] Retarget legacy frontend/contract tests and preserve assertions except intentional app destinations.

### Task 3: Add application policy, isolated storage and portal shell

**Files:** shared client runtime/application policy, auth flow/storage/header/onboarding screens; both root layouts; management shell/access-denied/index/welcome and synchronization hook; customer profile.
**Interfaces:** Expo extra identifies the app; pure policy chooses landing/back/profile routes; management raw storage is namespaced; each app owns bootstrap/router/query client.

- [x] Implement and verify explicit landing/access/profile/back policy and scoped storage.
- [x] Keep customer onboarding/vehicle and public features, remove embedded admin navigation.
- [x] Add portal role gate, preserved admin/operator routes and independent login/logout.
- [x] Add desktop/mobile and RTL portal navigation plus management-only data synchronization.
- [x] Run routing/session regressions and full frontend suite.

### Task 4: Verify, document and review complete migration

**Files:** README, environment examples, .gitignore, launch scripts/config, team ownership guide.
**Interfaces:** root commands launch/check/export both applications independently; both frontends use existing backend origins/API.

- [x] Confirm local backend CORS accepts 8081/8082; preserve private provider settings.
- [x] Run all frontend/shared TypeScript checks and frontend tests.
- [x] Run focused client-contract suites and server TypeScript/full test suite against test DB only.
- [x] Export customer web/iOS/Android and management web bundles with one worker.
- [x] Start both frontends; smoke customer map, portal role/login/navigation, logout isolation and RTL.
- [x] Obtain independent review; repair material findings and rerun affected checks.
- [x] Document feature parity, independent startup, ports and remaining practical limitations.


Verification evidence and practical limitations: [frontend split verification](../../operations/2026-10-14-frontend-split-verification.md). Desktop and RTL browser smoke completed; compact portal checking remains manual because the viewport override did not apply to that tab.
