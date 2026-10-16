# Team integration verification — 2026-10-15

Integration branch: `codex/integrate-team-updates`. The full-history merge combines our `6c4c75e` with team `origin/main` at `b0be9e9` (common ancestor `c6c6f3e`). This report records validation of the integration tree before publication; the integration PR records the published head and post-push checks. Local verification logs and private backups are ignored under `.runtime/`.

## Preservation and reviewed changes

- All 60 team routes are accounted for in the active customer app. All eight crash-module files, including five Kotlin sources, are retained. The Prisma union preserves 90 model/enum blocks and both inputs' fields and enum values.
- Customer and management remain separate workspaces sharing client/contracts/design packages, one backend and one database. Former root-app additions were moved into the active workspace paths.
- Preserved verified email sign-in, independent HttpOnly browser sessions, CSRF/origin checks, native SecureStore, account/GPS isolation, management/appearance/trusted parking, vehicle permissions and payment idempotency.
- Preserved team rides, host spots, gates/pass/patrol/overstay, traffic, destination/trip needs, car services, tourism, accessibility, voice alerts, rewards/notifications and Android crash detection.
- Gate entry/configuration remains restricted to ADMIN/PARKING_OPERATOR. Zone listing and patrol additionally allow ENFORCEMENT_OFFICER with the appropriate scope. Ordinary USER membership does not confer staff access.

Independent reviews and regressions cover gate permit/long-session overlap, actual-stop grace, QR visit/session atomicity, account/lot ownership, verified-link notifications, member permissions, duplicate violations and revalidation after locks. The final focused backend source review found no remaining actionable P1/P2 issues within that scope.

Crash upload retries retain account ownership and stable idempotency keys. Countdown, permission/module-load, delayed native-call fallback and native owner transitions are fenced against an account or alert change. Sharing demo seeds require explicit development opt-in, reject account-ID collisions and require a supplied private camera credential; general live seeding was not run.

## Final verification

| Check | Result | Local evidence |
| --- | --- | --- |
| Complete server suite | 36 files, 441 tests passed; exit 0 | `team-server-final.log` |
| Complete frontend suite | 193/193 passed; exit 0 | `team-frontend-tests.log` |
| Client contracts | 22 passed across 1 + 18 + 3 cases | `team-contracts-final.log` |
| TypeScript | All five frontend/shared workspaces and server compilation passed | `team-typecheck-final.log`, `team-backend-build.log` |
| Final exports | Customer web, management web, customer Android Hermes and customer iOS Hermes all passed | `team-exports-final.log` |
| Native module discovery | Local crash-detection module resolves to CrashDetectionModule | `team-autolink-search.json` |
| Docker images | Backend and worker builds completed | `team-backend-build.log`, `team-worker-build.log` |
| Export private-setting scan | 165 files, zero configured private-key matches | `scan-web-build-private-settings.cjs` |
| Runtime smoke | 20 checks passed: readiness, both frontends/scripts, email configuration, public features, protected routes, trusted/foreign CORS and realtime transport | `team-runtime-smoke-result.json` |
| Browser smoke | Both email-login pages rendered the normal code flow; no captured console errors | Browser UI verification |

Earlier Windows paging-file/Hermes failures and container path-resolution failures were superseded by these final green runs. A Docker/WSL restart interrupted one image export; a normal Docker Desktop restart recovered it, and both images and live services subsequently passed verification.

Frontend installation retained mandatory verification of reviewed source backports for three dependency packages. Raw npm audit still reports 22 metadata findings (19 high, 3 moderate); this is not a zero-vulnerability certification or a replacement for future upstream upgrades. The final server image install reported zero npm vulnerabilities.

## Database preservation

All 23 migrations replayed on a fresh isolated database with no Prisma schema drift; the existing dedicated test database accepted the eight new migrations. The same additive migration history subsequently deployed to the current local database; Prisma reports it up to date.

Before live migration, a 149,550-byte PostgreSQL custom-format backup was captured and validated using its PGDMP header and pg_restore listing. Post-migration comparison, repeated after catalog import, confirmed unchanged account IDs/roles/contact verification, wallet balances and vehicle links. Counts remain nine users, 25 parking zones, three user/vehicle links, nine operators, zero parking sessions, permits and wallet transactions. Local comparison fingerprints are not published.

Only the newly empty public catalog tables were imported: 14 car-service businesses (13 map-ready) and 26 tourism places (23 map-ready). No live reset, general demo seed or restoration of the team's dump occurred. Existing PostgreSQL, Redis and storage volumes were reused.

The team's previously committed dump remains physically retained locally but is excluded from the integration head and future Git/Docker contexts. Previously published history is not rewritten. Previously seeded demo accounts/device credentials require operator review before production; this merge does not silently revoke unrelated existing identities. Private environment values and this session's database backup remain local and ignored.

## Local operation and limits

| Service | Address / port |
| --- | --- |
| Customer web | http://localhost:8081 |
| Management web | http://localhost:8082 |
| API | http://127.0.0.1:4000 |
| PostgreSQL | Loopback 5434 |
| Redis | Loopback 6381 |
| Object storage API / console | Loopback 9002 / 9003 |

The verified web exports are served locally; normal development commands remain `npm run dev:customer` and `npm run dev:management`. The compose project remains `server`. Email OTP is selected and both development login bypasses are disabled. No OTP, payment, emergency call or authenticated data mutation was sent by runtime smoke checks; authenticated permissions and workflows were covered by the isolated automated suites.

APK compilation, physical-device sensors/crash detection, real emergency calling and provider delivery were not exercised. The host has Android SDK 35 and JRE 17 but no JDK. Native bundle exports do not verify APK installation or real call behavior. GitHub publication publishes source, not application hosting. The integration branch/worktree is retained for review and local operation.
