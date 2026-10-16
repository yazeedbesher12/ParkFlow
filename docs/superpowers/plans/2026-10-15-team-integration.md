# Preserve team updates and platform/security work implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for independent conflict domains, with root coordinating shared configuration and serial validation.

**Goal:** Produce a reviewed, tested integration branch containing both histories and publish its Pull Request to Yazeed.
**Architecture:** Managed isolated checkout, full-history merge, active customer/management npm workspace routes, shared contracts/client/design and one server/database.
**Tech Stack:** Git, Expo/React Native, TypeScript, Express, Prisma/PostgreSQL, Redis, Node tests/Vitest.
**Spec:** docs/superpowers/specs/2026-10-15-team-integration-design.md

## Global constraints
- Preserve both source histories and every existing feature; relocate team additions to active workspace paths.
- Preserve email OTP/security settings and private environment values; never publish secrets or restore a team database dump.
- No database reset or destructive migration, real provider delivery, emergency call or paid side effect.
- Heavy tests, installs and builds run serially. Root owns configuration/dependencies and runtime/publication.
- User authorized the integration branch and PR; no repeated permission prompt for this work.

## Review focus
- Added routes silently left in inactive root app/src directories.
- New backend types/relations lost while retaining our vehicle/parking/staff authorization.
- Team notification/crash synchronization reintroducing cross-account data or browser JWT storage.
- Native modules failing to autolink after moving the application root.
- Lockfile updates dropping source backports, private env inclusion, and migration failures on existing data.

### Task 1: Establish merge and feature inventory
**Files:** docs/operations/2026-10-15-team-integration.md; tests/team-integration.test.cjs; all Git-conflicted files.
**Interfaces:** inputs 6c4c75e and fetched origin/main; output conflict list and feature/path manifest.
- [ ] Record clean immutable baseline evidence and create integration branch in managed worktree.
- [ ] Merge origin/main without committing; capture conflicted paths and both versions.
- [ ] Add regression checks for active route/service/module wiring; observe missing wiring before fixes.

### Task 2: Preserve the customer feature/UI domain
**Files:** apps/customer/app, packages/client/src/components, screens, services, stores, hooks, i18n; packages/contracts/src feature types.
**Interfaces:** existing shared package exports, server DTOs and app-local aliases.
- [ ] Relocate upstream root routes/components/additions and merge UI changes without accepting entire conflicting files from one side.
- [ ] Preserve rides/spots/gates, routing/traffic/tourism/trip needs/rewards and accessible parking flows.
- [ ] Verify route inventory and relevant frontend regressions; report all changed interfaces to root.

### Task 3: Preserve backend/schema and secure identity domains
**Files:** server/src, server/prisma, server/tests; shared auth/sync/native configuration as assigned.
**Interfaces:** API contracts shared with Task2; our cookie/native session transport and existing role/ownership policies.
- [ ] Merge schema, additive migrations, route registration and services; retain tests from both histories.
- [ ] Merge notification/crash sync with secure browser/native lifecycle and account isolation.
- [ ] Check migration SQL and test on dedicated database; write regressions for integration-specific failures.
- [ ] Review ownership/privacy/authorization and native autolinking, then fix confirmed issues.

### Task 4: Reconcile dependencies and verify the complete source
**Files:** package.json/lock, server/package.json/lock, app configs/Metro/Babel/TypeScript, scripts, integration report.
**Interfaces:** root workspace installs/exports plus separate server dependency tree.
- [ ] Reconcile dependencies and reviewed patch versions without broad upgrades; install in isolated workspace.
- [ ] Run type checks, complete frontend/server suites, client contracts and dependency/security scans serially; fix causes of failures.
- [ ] Export customer/management web and customer Android/iOS and verify native autolinking.
- [ ] Independent final review of complete integration; resolve important findings and rerun covering checks.

### Task 5: Publish, run and confirm the pushed revision
**Files:** integration report and PR body; ignored runtime artifacts only.
**Interfaces:** existing fork remote and upstream main; local Docker/services and existing private configuration.
- [ ] Back up local data; apply only validated safe migrations, rebuild and run the integrated revision without resetting volumes.
- [ ] Check actual frontend/API/socket/auth configuration and representative new features without real provider side effects.
- [ ] Scan staged source/export artifacts for secrets; commit clean merge and fixes.
- [ ] Fetch upstream again, incorporate any further updates safely, push integration branch and open/attach PR to upstream main.
- [ ] Confirm remote branch SHA equals tested local HEAD and services still run; report PR URL, counts and concrete limits.