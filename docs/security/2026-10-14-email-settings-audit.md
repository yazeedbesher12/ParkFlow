# Email settings and account isolation security audit — 2026-10-14

The running local instance uses real email verification. The user confirmed
successful delivery and sign-in through the customer application. This review
then examined account switching, personal location persistence, session ownership,
private configuration and dependency advisories. It is a code and regression
review, not a certification or a complete penetration test.

## Verified configuration

| Setting | Running value / behavior |
| --- | --- |
| Authentication | `AUTH_LOGIN_METHOD=email`; six-digit emailed code |
| Sender | `vbngvbn14@gmail.com`; sending configuration does not grant a role |
| SMTP | `smtp.gmail.com:465`, implicit TLS, `requireTLS`, private App Password present |
| Development bypasses | Both `DEV_SKIP_EMAIL_OTP` and `DEV_SKIP_PHONE_OTP` are false |
| Phone delivery | `SMS_PROVIDER=disabled`; phone authentication endpoints reject with 403 |
| Code lifetime | Five minutes; single successful consumption |
| Address protections | 60-second resend cooldown; five sends/hour and ten/day |
| Guess protection | Five incorrect codes lock verification for 15 minutes; resend preserves failures |
| IP protections | Ten code requests and 30 verification requests per ten minutes; general API limit 300/minute |
| Access / refresh | Access token 15 minutes; refresh token 30 days with rotation/reuse handling |
| Administrator session | Absolute eight-hour limit, including refreshed descendants |
| Signing / payment webhook keys | Three independent cryptographically generated 256-bit private keys |
| Identity encryption | Existing private 32-byte profile encryption key preserved |
| Network | API, PostgreSQL, Redis and object storage published on loopback by default; allowed browser origins are loopback |
| Environment / payments | `development`; payment provider remains `development` |

The three public-example signing/webhook secrets were replaced after explicit
user approval, and the backend and worker were recreated. Previously issued
tokens and pending email-code hashes no longer validate. Request a fresh code
through the application. The SMTP password, profile encryption key, identities,
roles and business records were preserved.

The approved legacy customer's address is now verified and the account remains
ACTIVE with role USER. No administrator role was assigned to this customer or
to the sending mailbox. Public email cannot be delivered to sample `.local`
administrator addresses; a real administrator receiving address still needs an
explicit ownership/linking process.

## Corrections

- The API client binds each private request to the login that started it.
  Delayed responses and 401 retries cannot refresh/replay the old user's action
  as another user, including logout and another login to the same account.
  Successful token rotation within one login remains supported.
- Idempotency-key storage operations are serialized per request key so an older
  operation cannot overwrite or remove a newer login's recovery key. Tests use
  a committed reservation ledger and a lost response, checking that recovery
  returns the original reservation instead of creating a duplicate. Cleanup and
  acknowledgment are coordinated with session publication: successful actions
  are acknowledged before the next login, or canceled with the recovery key
  preserved. A module-reload regression exercises recovery from persisted data.
  A known successful server response remains successful if optional device-key
  cleanup fails, including Android's partial-delete behavior; an authorized
  completion is acknowledged while login publication is still blocked.
  In the current process, an acknowledged key is retired before the next
  intentional identical action. After a restart, if that key remains and no
  completion metadata survived, conservative recovery may return the previous
  result once; it does not silently perform another debit, and normal cleanup
  then retires the key.
- Logout and a different-account sign-in clear the saved car location, GPS
  origin, route request, notes and reminder details before publishing the next
  account. Route persistence is serialized, pending hydration is invalidated,
  and captured actions are invalidated across the account transition. A token
  refresh for the same signed-in account preserves the location.
- Actual screen callbacks retain their account-scoped actions through GPS and
  notification waits. The map's local state resets for a different principal,
  and GPS completions are invalidated across logout/relogin and unmount. Real
  route/offline-cache tests prevent the former user's GPS entering the next
  user's route cache. Captured native reminders are canceled even when cache
  removal fails. New-account sign-in fails closed if private-data removal fails.
- The server now requires the JWT subject to match the owner of its stored
  session, both in the initial check and the administrator's locked recheck.
  A valid session identifier cannot be combined with another user's identity.
- Compatible UUID fixes were scoped to Xcode tooling and Gaxios. No forced
  Expo/React Native upgrade or incompatible decoder override was applied.
- Docker's backend port now defaults to `127.0.0.1:4000`. Deliberate physical-device
  testing must configure `BACKEND_BIND_ADDRESS` to the trusted LAN interface and
  adjust the device API URL; the database/storage ports remain loopback-only.

## Verification

| Check | Result |
| --- | --- |
| Final frontend suite | 129 passed, zero failures |
| All five frontend/shared TypeScript workspaces | Passed on final source |
| Full server suite on dedicated `_test` DB / Redis DB 15 | 361 passed in 29 files |
| Session-owner regressions after dependency update | 5 passed |
| Client contract checks after dependency update | 22 passed across three isolated groups |
| Server TypeScript | Passed |
| Backend / worker Docker build and recreation | Passed; deployed compiled owner checks confirmed |
| Final customer / management web exports | Both passed |
| Running customer / management endpoints | `/email` returns 200 on ports 8081 and 8082; background Expo processes confirmed running |
| Live HTTP checks | Ready 200; private customer/admin/operator APIs 401; bypass and phone routes 403; untrusted origin 403 |
| Headers on normal API responses | `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` |
| Private secret scan of tracked and proposed files | 518 files scanned; no configured private secret found; populated `.env` ignored |

Account-switch and session-subject regressions were observed failing before
their fixes. Tests cover delayed JSON responses, refresh, secure storage,
notification cancellation and GPS callbacks, with positive controls preserving
legitimate operations. Backend mutating tests used only the dedicated test
database, isolated test keys and intercepted delivery; no real email/SMS was
sent by these suites. Live main-database checks were read-only.

The full 361-test server run followed the session-owner correction. After the
scoped UUID update, the five session-owner tests, 22 client-contract checks,
UUID/Gaxios/Xcode compatibility checks, server TypeScript and Docker builds
were verified; the full server suite was not repeated for that library-only
maintenance change.

An all-platform customer export attempt failed in the native Hermes compiler
under this Windows host's memory/commit limit. A parallel TypeScript attempt
also hit that limit; final checks are run serially. Native physical-device
installation and actual notification cancellation still require device testing.
Prior exports are historical evidence, not a claim that the current native
bundle was verified.

Final visual inspection through the in-app browser could not be completed when
the browser connection became unavailable. Both final web builds and running
HTTP endpoints passed; no final visual sign-in or new live code delivery is
claimed by this audit.

## Dependency findings

The initial frontend audit reported 30 findings and the server two moderate
findings. After compatible UUID fixes, the server audit reports **zero known
findings**, while the frontend reports **22: 19 high and three moderate**,
including propagated dependency entries. There are three remaining root issues:

| Dependency | Exposure in this project | Remaining action |
| --- | --- | --- |
| `braces` 3.0.3 | Metro glob/config build tooling | No published patch in the advisory at audit time; monitor upstream and avoid untrusted build patterns |
| `node-forge` 1.4.0 | Expo CLI certificate/signing tooling; no observed application authentication use | No published patch in the advisory at audit time; monitor upstream |
| `decode-uri-component` 0.2.2 | Expo Router / query-string runtime; malformed URL input can stall the client | Needs a compatible upstream fix or tested Router/SDK migration; 0.5.0 is ESM-only and breaks the current CommonJS caller if directly overridden |

Sources: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
[decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), and
[UUID 11.1.1 maintenance release](https://github.com/uuidjs/uuid/releases/tag/v11.1.1).
The patched UUID behavior and existing Xcode CommonJS/Gaxios multipart contracts
were exercised. Audit counts describe known advisories, not absence of all bugs.

## Before public deployment

- Replace the Gmail App Password disclosed in the conversation through the
  account owner, then update only private server configuration. It is not
  committed to the repository. Do not reuse exposed provider credentials.
- Configure a production payment provider and `NODE_ENV=production`, private
  database/storage credentials, an HTTPS gateway and explicit production origins.
  Current example database/storage credentials are acceptable only for this
  local development environment with loopback isolation.
- Native sessions use Keychain/Keystore. Browser sessions fall back to
  JavaScript-accessible AsyncStorage. The management web portal needs a hardened
  production session design, such as an HttpOnly cookie flow with corresponding
  CSRF handling, and a web XSS review. No complete XSS/penetration assessment or
  public deployment validation is claimed here.
- Resolve or formally assess the remaining frontend advisories, verify native
  behavior on devices, and exercise backups, restore, monitoring and provider
  delivery before accepting real public transactions.

Private environment files, logs, backups and generated bundles remain ignored.
See [EMAIL_OTP.md](../../EMAIL_OTP.md) for provider configuration and account
ownership rules, and [README.md](../../README.md) for local startup and ports.
