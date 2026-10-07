# ParkFlow — Smart Parking for Palestine

ParkFlow is an Expo and TypeScript application backed by Express, Prisma,
PostgreSQL and Redis. It supports finding parking, reservations, parking sessions,
wallet payments, community road reports, and workspaces for administrators and
parking operators. The interface supports English and Arabic with RTL layouts.

This is a development and pilot implementation. Payment delivery, SMS delivery,
verified vehicle associations, and trustworthy occupancy data require configured
providers or operator processes before public use.

## What is included

- Phone registration and passwordless sign-in with Palestinian `+970` numbers,
  expiring verification challenges, attempt limits and resend limits. Provider
  adapters remain available while phone sign-in is temporarily paused for team
  development.
- Optional development email sign-in without a password or code. Existing
  accounts retain their roles; registration creates ordinary users. These
  sessions are rejected when the mode is disabled, and production refuses to
  start with development authentication enabled.
- Administrative user and company management, vehicle verification review,
  parking review and publication, and audited role and status changes.
- Operator membership and access controls, parking prices, location, entrances,
  capacity, weekly hours, closures, availability, check-in and analytics.
- Application appearance configuration with preview, publication, version
  history and rollback for supported content, colours and branding.
- Explicit demo and live inventory, reservation quotes calculated by the server,
  availability freshness checks, cancellation and recovery flows, tariff
  snapshots, and idempotent wallet operations.
- Current location, parking layouts and forecasts, navigation, offline queues
  for road reports and feedback, and Arabic and English translations.

## Local setup

Requirements: Node.js, npm, and Docker Desktop with its Linux engine running.

1. Install the frontend dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and `server/.env.example` to `server/.env`.
   For a browser on this computer, set the frontend
   `EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`. For a physical device,
   use the computer's LAN IP instead of `localhost`.
3. In `server/.env`, generate private values for the JWT secrets and payment
   webhook secret. Set `PROFILE_ENCRYPTION_KEY` to a private 32-byte key encoded
   as 64 hexadecimal characters for national ID encryption. Keep this key and
   database backups secure. Example local database and storage credentials are
   intended for development only.
4. Start the backend services from `server`:

   ```powershell
   docker compose up -d --build
   docker compose exec backend npm run db:seed
   ```

   On a fresh development database, set `SEED_ADMIN_EMAIL=admin@parkflow.local`
   before seeding if an administrator is needed. The seed does not promote an
   existing user. Owners and staff are assigned through the administrator's
   management workspace.
5. Start the frontend from the project root:

   ```powershell
   npx expo start --web --port 8081 --localhost --max-workers 1
   ```

   Open `http://localhost:8081`. For native development, use `npx expo start`
   and select a connected device or emulator.

## Temporary team sign-in

The committed example configuration keeps authentication shortcuts disabled.
To use email while developing in a trusted environment, explicitly set these
values in the private `server/.env`:

```dotenv
NODE_ENV=development
DEV_SKIP_EMAIL_OTP=true
DEV_SKIP_PHONE_OTP=false
```

Then run `docker compose up -d --force-recreate backend worker` from `server`.
Choose sign-in on the welcome screen or open `/email`, and enter an existing
account's email. New users enter their name and email before completing their
profile. This mode grants access based on knowing an email address, so limit the
development instance to the trusted team. It does not mark new emails as verified.

Set both shortcut flags to `false` and recreate the backend and worker to restore
phone verification. Configure an SMS provider separately; existing provider code
and verification limits are retained. Development email sessions stop working
after restoration. A new development account without a phone needs a verified
phone and an appropriate account-linking process before real use.

See [phone authentication and restoration instructions](PHONE_AUTH.md), including
Arabic instructions, and [SMTP email verification setup](EMAIL_OTP.md).

## Local ports

| Service | Host port | Container port |
| --- | --- | --- |
| Expo web | 8081 | — |
| Backend API | 4000 | 4000 |
| PostgreSQL | 5434 | 5432 |
| Redis | 6381 | 6379 |
| Object storage API | 9002 | 9000 |
| Object storage console | 9003 | 9001 |

The worker does not expose a port. PostgreSQL, Redis and object storage are bound
to the host loopback address. The API is under `/api/v1`; `/ready` checks service
readiness. Administrative pages include `/admin`, `/admin/manage`,
`/admin/vehicles` and `/admin/appearance`; the operator workspace is `/operator`.
Access is enforced by the backend, not only by hiding pages.

## Verification

Frontend checks, from the project root:

```powershell
npm run typecheck
node --test --test-concurrency=1 tests/*.test.cjs
```

Backend checks, from `server`:

```powershell
npm ci
npm run typecheck
node scripts/migrate-test.cjs
npm test
```

Start PostgreSQL and Redis before running backend tests. `TEST_DATABASE_URL` must
point to a dedicated database whose name ends in `_test`. Create it once if
needed, for example with
`docker compose exec postgres createdb -U parkflow parkflow_test`.
The suite uses Redis database 15, disables SMS delivery, and disables development
authentication by default; authentication tests enable their modes explicitly.
Do not use the application database as the test database.

## Architecture

```text
app/                    Expo Router screens and workspaces
src/components/         UI, map, management and domain components
src/hooks/              TanStack Query hooks
src/services/http/      Typed backend adapters
src/store/              Authentication, preferences and application configuration
src/offline/            Queued road reports and feedback
src/theme/              Design tokens and configured appearance
src/i18n/               English and Arabic strings
server/src/modules/     Authentication and parking business rules
server/src/jobs/        Background workers
server/prisma/          Schema, migrations and seed
server/tests/           Backend and integration checks
tests/                  Frontend regression checks
docs/operations/        Setup and operating guidance
docs/reviews/           Implementation and verification records
```

Screens use hooks and typed services. `src/services/index.ts` selects the HTTP
implementations for application data; legacy prototype helpers remain in the
source. PostgreSQL owns account, parking and financial records. Redis supports
verification limits, jobs and coordination. Signed evidence URLs use object storage.

## Parking and payment rules

- A vehicle can have only one active session, while an account can park multiple
  vehicles. Session cost comes from server timestamps and the tariff captured
  when parking starts.
- Insufficient wallet funds do not erase a finished parking session. Its payment
  failure can be settled later. Top-up and payment requests use idempotency keys;
  an uncertain result retains its key for recovery.
- Unlinking a vehicle preserves its parking history. Adding a plate alone does
  not establish a verified association or expose protected violations, evidence
  or permits.
- Seeded zones use demo inventory and make no live availability guarantee. Live
  manual inventory requires positive capacity and a fresh operator snapshot.
  A live hold lasts up to 15 minutes; confirmed reservation records remain
  authoritative until cancellation or completion.
- Reservations and payment mutations require a connection. Road reports and
  parking feedback can queue offline with stable idempotency keys.

## Platform notes

Native maps use `react-native-maps`; the web implementation projects the same
coordinates onto a styled surface. Android Google Maps tiles require a configured
Maps SDK key and an appropriate development build. `app.config.js` reads
`GOOGLE_MAPS_API_KEY` from the environment. iOS uses Apple Maps.

Device tokens use SecureStore. Web storage does not provide the same protection
as a device secure store. Arabic layout direction is driven by React state, so
language changes do not require an application restart.

Private `.env` files, database backups, runtime artifacts, assistant sessions and
provider support diagnostics are excluded from Git. Copy the example environment
files and supply private values locally instead of committing credentials.
