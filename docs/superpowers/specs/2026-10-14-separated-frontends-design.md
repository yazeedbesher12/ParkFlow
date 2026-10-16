# Separate customer and management applications

## Approved intent

The team will develop the customer application independently of the administrator
and parking-owner portal. Both frontends remain in this repository and use the
existing backend and database. Preserve every existing feature and server-side
permission. The user explicitly requested implementation of this architecture.

## Structure and ownership

- `apps/customer`: existing customer Expo routes, map/domain/navigation components,
  and application bootstrap. Keep customer native identities and platform support.
- `apps/management`: independently launched Expo web portal, existing admin and
  operator routes/components, management bootstrap, responsive navigation shell.
- `packages/contracts`: shared domain and service request/response types.
- `packages/design`: shared design tokens/assets.
- `packages/client`: shared UI primitives, localization, authentication screens,
  stores, storage adapters, HTTP services and common utilities. It imports neither
  application. Each application bundle instantiates its own client state.
- `server`: existing service, Prisma schema/migrations and database remain intact.

Use npm workspaces for frontends/shared packages. Keep the existing standalone
server dependency tree to preserve its TypeScript/Prisma versions. Keep existing
Expo 57 and React dependency versions; this migration is not an SDK upgrade.

## Routes and features

Customer retains onboarding, map/activity/vehicles/wallet/profile, parking,
reservations/recovery/layouts, roads, scanning, notifications and violations.
It contains no administrator/operator feature routes or components. All completed
roles may use customer features; customer login lands on the customer map.

Management retains `/admin`, `/admin/manage`, `/admin/appearance`,
`/admin/vehicles`, `/operator`, `/operator/manage`, `/operator/analytics`, and
`/operator/zones/[id]`. Retain all current actions, review confirmations, version
checks, analytics and reservation recovery. Administrator login lands on `/admin`;
operator login lands on `/operator`. Ordinary accounts receive an access-denied
screen, never management data. Authorized incomplete profiles can complete their
details without being sent to the customer vehicle-onboarding route.

Existing management paths remain stable on the management origin. Remove the
embedded admin link and stacks from customer. Shared header back fallback follows
the active application. Management provides navigation and logout on desktop and
mobile, with English/Arabic layouts and access to every preserved workspace.

## Authentication and shared data

Each app is identified in its own Expo configuration as `customer` or `management`.
Preserve legacy customer persisted keys; prefix every management storage key,
including auth, preferences, offline and pending operations. Never hydrate a
customer session in management, and never transfer tokens in links or URLs.
Each login obtains its own existing server token family. Logout of one app affects
that session only; logout-all and server role/status revocation keep their existing
cross-session semantics. Preserve temporary development email login and dormant
phone/SMS verification, limits and production safeguards.

Keep all ownership/role enforcement and authoritative parking/financial rules in
the existing backend. Allow both local frontend origins in backend HTTP and socket
CORS. Each frontend connects to the same API, with its own query cache, websocket
and refresh coordination. Management refreshes its own admin/operator/management
queries when backend events or window activation indicate data changes.

## Configuration and launch

Customer runs on 8081, management on 8082, API on 4000. Database/Redis/storage ports
remain unchanged. Root commands start each app separately, check both apps and
shared packages, and run all frontend regression tests. Each app has its own Expo,
Babel, Metro and TypeScript configuration and environment example. Private local
environment values remain ignored; retain configured native Maps/push settings.
Management uses a responsive web shell; customer keeps its phone-shaped web shell.

## Validation and migration safety

Add regressions for application-specific landing/access policy and real persisted
session separation using a common storage boundary. Retarget and preserve the
existing frontend and client/server contract tests. Check both TypeScript projects,
frontend regressions, focused contract suites and backend tests. Export customer
web/iOS/Android bundles and management web bundle. Browser-smoke both origins,
Arabic layout, customer map and privileged portal pages. Native bundle export is
not a claim of physical-device installation testing.

Use a dedicated branch from the preserved local implementation. Do not overwrite
upstream main or change existing reservations, memberships, wallet balances or
private provider configuration during the move. Document shared-file ownership and
small feature PRs so frontend teams can coordinate backend/contract changes.
