# Browser session and dependency security design

The user requested implementation of the remaining frontend dependency fixes and
stronger browser sessions, preserving customer, administrator, operator and native
features. These are local implementation changes; no public deployment, provider
credential change or real test message is part of this work.

## Browser transport

- Native clients retain existing bearer access/refresh DTOs and SecureStore.
- Browser responses contain only `{transport:'cookie', userId, sessionId,
  loginId, expiresAt, csrfToken}` plus the existing user DTO. `sessionId` is the
  current refresh record id; `loginId` is its refresh family id.
- Browser fetches include credentials and `X-ParkFlow-App`. Private requests also
  send `X-ParkFlow-Session` and `X-ParkFlow-Login`; unsafe requests send
  `X-ParkFlow-CSRF`. These identify the initiating session rather than trusting
  whichever account an ambient cookie happens to select.
- Exact, disjoint origin/application maps are mandatory. Cookie JWTs bind the
  application and browser identifier; native authentication rejects those JWTs.
- Separate application browser-id cookies initialize an anonymous browser slot.
  These identifiers cannot authenticate without a signed credential. Access and
  refresh cookies have application/family-specific names. A Redis pointer selects
  the active family and sid, and a compare-and-delete Redis mutex serializes
  publication. Late responses from an older family cannot overwrite or delete a
  newer family's credentials. Cookie publication checks mutex ownership atomically.
- Cookies are HttpOnly, SameSite Strict, Path `/`, no Domain; production uses
  Secure and `__Host-` names. Local development uses non-prefixed names over HTTP.
  The browser identifier keeps its initial refresh-TTL cookie retention window;
  normal browsers sign in again after expiry. Refresh JWT expiry still rolls,
  and the existing administrator eight-hour absolute server deadline remains.
- `GET /auth/web-session/bootstrap` initializes the browser cookie when needed,
  validates the active refresh proof and returns metadata/user or nulls. It never
  changes a login to another account without server proof.
- Web `POST /auth/refresh` uses cookie credentials and expected identity/CSRF,
  while native refresh retains its body token. Stale web nonces are checked before
  native replay-revocation logic so another tab cannot revoke a legitimate rotation.
- `POST /auth/web-session/logout` conditionally revokes the proven family and
  clears only that family's cookies. A canceled old verification cannot clear the
  newly selected family. Native `/auth/logout` remains supported.
- Web auth operations use an application Web Lock and local queue fallback.
  Bootstrap/refresh may continue only the same user/login when recovering an
  already rotated tab. Another login never receives a replay of an old mutation.
- Browser storage contains no JWTs, authenticated profile or CSRF token. Only
  non-secret last-login and logout-fence identities persist. An offline logout
  prevents automatic restoration; cleanup cannot revoke a newer login.
- Socket upgrades enforce origin, application, sid/login and CSRF, and validate
  cookie credentials. Native socket bearer authentication remains available.

## Dependency corrections

Preserve package/API compatibility and apply pinned source-hash-verified backports
for braces nesting, Forge canonical DigestInfo validation, and linear malformed
URI decoding. Installation applies patches; tests and Metro verify their presence
and fail on upstream drift. Preserve published package versions and disclose raw
npm audit counts rather than suppressing advisories or inventing fixed releases.

## Verification and limits

Tests must cover actual cookie headers/side effects, origin/app/CSRF rejection,
native compatibility, role/status/revocation/admin eight-hour lifetime, canceled
verification, offline logout, concurrent rotation, stale actions, location privacy,
idempotency, sockets and upload authorization. Dependency negative cases require
bounded child processes and ordinary glob, URI, RSA/certificate/CSR controls.
Run full suites, types and exports serially on this memory-limited Windows host.
HttpOnly reduces credential theft; active same-origin XSS remains a separate risk.
