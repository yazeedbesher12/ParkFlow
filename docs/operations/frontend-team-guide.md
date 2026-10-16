# Frontend team guide

ParkFlow has two independently launched Expo applications in one npm workspace
repository. Each uses the same existing API and database. Customer work and staff
portal work have separate routes, application state, persisted sessions and query
caches.

## Ownership

| Location | Owner and purpose |
| --- | --- |
| `apps/customer` | Customer team: onboarding, map, parking, reservations, vehicles, wallet, activity, profile, roads, notifications, violations, rides, hosted spots and role-authorized gate/patrol tools; native and web bootstrap |
| `apps/management` | Portal team: administrator and operator routes, parking and organization editors, staff controls, responsive shell and staff login |
| `packages/contracts` | Shared domain types, request/response interfaces and appearance schemas; coordinate changes with both frontend teams and the API team |
| `packages/design` | Shared design tokens and assets; review visual impact in both applications |
| `packages/client` | Shared UI, localization, authentication screens, API clients, stores, storage and utilities |
| `server` | API team: authorization, parking and financial rules, Prisma and backend dependencies |

An application's `@/` alias resolves only to its own `src`. Import shared code
through `@parkflow/client`, `@parkflow/contracts` or `@parkflow/design` package
exports. Shared packages must never import application routes or components.
Keep feature-specific UI in its owning app; move code into a shared package when
both applications need the same behavior.

## Local development

Install workspace dependencies from the repository root with `npm ci`. The server
has its own dependency tree and lockfile: run `npm ci --prefix server` separately.
Use each application's environment example to configure the existing API address;
keep private local environment files ignored.

Run these commands from the repository root in separate terminals:

| Command | Service |
| --- | --- |
| `npm run dev --prefix server` | Existing backend, port 4000 |
| `npm run dev:customer` | Customer web app, `http://localhost:8081` |
| `npm run dev:management` | Staff portal, `http://localhost:8082` |
| `npm run android` / `npm run ios` | Customer native development |

Keep the existing database, Redis and storage setup. The frontend split does not
require a new database. New feature migrations are additive and shared by both apps;
apply them with `prisma migrate deploy` before starting updated services.
Both local frontend origins must be allowed
by backend HTTP and socket CORS.

The customer app retains its phone-sized web layout. The staff portal uses a
responsive layout up to 1280px and a wrapping menu on small screens. Both support
English and Arabic.

## Portal route parity

| Route | Preserved workspace |
| --- | --- |
| `/admin` | Overview, user roles/statuses, availability, reports, appeals and audit |
| `/admin/manage` | Parking locations, organizations, pricing, hours, closures and team access |
| `/admin/appearance` | Bilingual content/branding, drafts, previews, publication history and rollback |
| `/admin/vehicles` | Vehicle association verification and reviewed access decisions |
| `/operator` | Assigned locations, reservation counts and feed health |
| `/operator/manage` | Organization-scoped locations and staff |
| `/operator/analytics` | Reservation conversion and feed-quality statistics |
| `/operator/zones/[id]` | Availability, reservations, QR check-in and recovery |

The operator home links to its assigned location detail pages. Administrators can
navigate both staff workspaces; operators see their permitted sections. Existing
server permissions still govern every read and mutation.

## Sessions and access

Each app obtains its own token family from the existing authentication service.
Management storage is namespaced while customer storage preserves legacy keys.
Never put tokens in links, and never copy a customer's session into the portal.

Completed accounts using the customer app land on the map. Management accepts
administrator and parking operator accounts; ordinary accounts receive an access
screen without mounting staff data queries. Assigned staff with incomplete
profiles can complete their details inside the portal. Staff welcome offers
sign-in only and follows the backend's configured login method. The normal method
is email with an emailed code for all roles; phone endpoints are disabled in email
mode. See [email setup](../../EMAIL_OTP.md) for SMTP and verification limits.

Portal sign-out revokes its current session, clears its query cache and returns to
its own welcome screen. It does not call logout-all. Existing account revocation
and explicit logout-all retain their server semantics.

## Checks and feature pull requests

Run from the repository root:

```sh
npm run typecheck
npm test
npm run test:contracts
npm run export:customer
npm run export:management
```

`test:contracts` sequentially runs the server's management client, appearance
schema/client and appearance store suites. These focused suites do not use the
database integration setup. Backend changes also require the server's checks and
integration suite using the established test database.

Smoke the changed flows on the app's own origin, at desktop and mobile widths,
and in Arabic. Authentication changes need customer/portal login, hydration and
logout checks with both apps open. Build the customer native bundles when shared
code changes platform-sensitive behavior; a bundle export does not verify a
physical device installation.

Keep pull requests focused on one feature. When changing a shared API contract,
coordinate its request/response types, both callers and server authorization in
the same reviewed change. Include the concrete behavior change and relevant
validation. Preserve existing pricing snapshots, reservation recovery, review
confirmations, version conflicts and membership permissions.
