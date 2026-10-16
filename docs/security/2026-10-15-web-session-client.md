# Browser session transport

The customer and management frontends share an API while maintaining independent
browser sessions. Email OTP registration/login and native bearer authentication
retain their existing routes and account/role checks.

## Credentials and identity

- Browser access and refresh credentials are HttpOnly cookies. They are absent
  from authentication JSON, application state, AsyncStorage, and localStorage.
- Browser JSON contains only `transport: cookie`, `userId`, `sessionId`, `loginId`,
  `expiresAt`, and an in-memory `csrfToken`. `loginId` remains stable during token
  rotation; signing in again creates a new login identity.
- Browser requests use `credentials: include`, an application header, and expected
  session/login identifiers. Authenticated requests also send the in-memory CSRF
  token. Browser requests never send an Authorization bearer header.
- The only persisted authentication metadata is an application-scoped
  `{userId, loginId}` binding and, when needed, a pending logout fence of the same
  shape. Neither is an authentication credential. No profile or CSRF token is
  persisted. Existing browser JWT storage is deleted on boot and sign-in.
- Native clients keep access/refresh credentials in Keychain/Keystore through
  SecureStore and retain the bearer request/refresh flow.

## Reloads, account changes, and concurrency

Boot obtains identity from `/auth/web-session/bootstrap`. Stored metadata never
authenticates a user by itself. If the cookie belongs to a login different from
the last successfully published binding, boot remains signed out until an
explicit login. This prevents a late response from restoring an older account.
Browser startup without connectivity also remains signed out; it does not revive
a stored profile. Already authenticated clients retain the existing account-scoped
offline read cache and permitted report retry queue.

Verify, bootstrap, refresh, and logout operations are serialized under an
application-specific Web Lock, with a local queue fallback. The lock includes
cookie response handling, cancellation cleanup, and store publication. The server
also binds cookies to the application/browser and active login; cookies are not
scoped by TCP port and Web Locks are not shared across different origins.

Refresh first bootstraps while holding that lock. It accepts only the initiating
user/login, can recover another tab's rotation of the same login, and never
replays an old action as a different login. The refreshed browser state uses the
server's current profile and role, so an older cached role is not republished.
If another tab already rotated that login and its access session has more than
30 seconds remaining, the client adopts it without a second refresh POST. This
prevents tabs from repeatedly rotating and disconnecting each other's sockets.
Expired/missing access, near-expiry sessions, and unchanged session identifiers
continue through the protected refresh endpoint.
Existing per-request login epochs,
mutation idempotency keys, and serialized cleanup remain in place.

Logout records a pending fence before attempting conditional server revocation.
An offline logout clears local authentication immediately; a later bootstrap must
complete revocation before publishing that login. A fence for an old login never
revokes a newer login. A browser storage failure does not prevent online server
revocation being attempted. If both storage and connectivity are unavailable,
persistent logout across a browser restart cannot be guaranteed until the server
can be contacted or the browser's site data is cleared.

Cancelled OTP responses are conditionally revoked before the lock is released.
The server selects and clears only the returned login's cookies, so cancellation
does not clear a newer login. Server-confirmed identity plus the remembered
matching binding preserves saved car location across a reload. Logout and changes
to a different account retain the existing GPS/car-location cleanup boundaries.

## Sockets and local development

Web sockets send application/session/login/CSRF metadata and use cookie
credentials. They send no bearer token, reconnect when the session rotates, and
recover an authentication error or explicit server disconnect only within the
initiating login. An explicit server disconnect disables Socket.IO automatic
reconnection, so the web client safely adopts or refreshes that login and creates a new
socket even when its previous access session is unexpired. Native sockets
retain bearer authentication. Server origin validation applies to websocket
upgrades as well as HTTP requests.

Use a consistent frontend hostname during testing: customer port 8081,
management port 8082, shared API port 4000. When both the configured API hostname
and browser hostname are `localhost` or `127.0.0.1`, the client aligns the API host
to the browser host so Strict cookies remain on the same site. Deployed API
destinations are not rewritten. Different hostnames and origins have distinct
browser storage and locks; use the configured canonical application origins for
team testing and deployment. Production requires HTTPS and Secure cookies.

The browser identifier cookie expires after the configured refresh TTL (currently
30 days from initialization) and is not renewed by token rotation. Normal
browsers sign in again after it expires. This retention policy does not impose
a server-enforced 30-day absolute session-family deadline. The existing
administrator eight-hour absolute deadline remains enforced by the server.

## Validation coverage

`tests/browser-session-security.test.cjs` exercises cookie side effects, no-token
browser storage, legacy migration, independent applications, offline and failed
storage logout, canceled verification, same-login rotation, different-login
rejection, response contract checks, native compatibility, loopback aliases,
saved-car reloads, stale responses/mutations, and both real synchronization hooks.
Existing native request-isolation/idempotency and GPS privacy regressions remain
enabled. The operation audit records the final complete suite/build results.

HttpOnly reduces credential theft through scripts; it does not prevent active
XSS from making authenticated requests. SameSite supplements origin and CSRF
checks. See [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
and [Socket.IO origin handling](https://socket.io/docs/v4/handling-cors/).
