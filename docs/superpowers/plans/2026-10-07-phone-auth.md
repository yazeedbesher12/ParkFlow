# Phone sign-up and passwordless sign-in

**Goal:** New users enter their name, verify a Palestinian (+970 default) mobile number, complete personal details and add a vehicle. Returning users authenticate with the same phone and SMS OTP only.

**Architecture:** Add phone-specific OTP endpoints to the existing Express/Redis/PostgreSQL session system. Redis atomically enforces challenge consumption, expiry, resend limits and a phone-level failed-attempt budget. Existing data is preserved; unverified legacy phones cannot take over accounts. The Expo onboarding flow uses phone challenges and backend profile completion, not device-wide onboarding state.

**Constraints:** No SMS provider is available. Explicit development delivery prints a local test code; no code is returned by authentication endpoints, and development delivery is forbidden in production. Production uses configured Twilio SMS; credentials remain in server environment. No password or frontend OTP bypass. National ID is encrypted, optional, never used as authentication, and responses contain only a masked suffix. Contact email is unverified and cannot take over an existing email account.

**Contracts:** POST /auth/phone/request-otp {phone, purpose: 'register'|'login', fullName?} returns {challengeId, phone, resendAfterSeconds, expiresAt, delivery: 'sms'|'development'}. POST /auth/phone/verify-otp {challengeId, code} returns {session,user,isNewUser}. User DTO gains profileCompletedAt and nationalIdMasked. POST /users/me/complete-profile {email?,nationalId?} stores details, marks completion and returns sanitized user. PATCH /users/me accepts name/locale/email/nationalId but never phone/role/status.

## Tasks
- [x] Backend phone OTP and delivery: normalize mobile numbers, 6 digits/300 seconds, one active challenge, atomic single use, five failed guesses across resends, 900 second phone lock, 60 second resend, 5 sends/hour and 10/day per phone, bounded IP limits. Tests cover replay, races, guessing/resends, unknown login, suspended/unverified legacy users and failed delivery.
- [x] Frontend: name -> phone -> OTP -> details -> existing vehicle screen; returning phone login; accurate resend/lock timers and development notice; remove email bypass from onboarding. Arabic/English copy. Use session-specific/server completion gates.
- [x] Profile storage: additive migration, AES-256-GCM ID storage, sanitized user DTO in all auth/profile responses, self-only data update, duplicate email validation and tests. Existing completed accounts stay usable.
- [x] Integration: migrations, typechecks, complete backend test suite, web bundling and local HTTP smoke. Review security edges independently before reporting.

## Review focus
Concurrent requests must not spend multiple guesses on one successful code. Resending must not reset the phone-level failure counter. Failed delivery cannot leave a usable challenge. Name/phone query parameters must not determine a verified identity. Adding contact details cannot grant verified-email sign-in or leak an encrypted ID in any user response.

## Execution evidence — 2026-10-07

- Server: 129 tests in 11 files passed, including 25 phone-auth and 6 profile integration tests against PostgreSQL/Redis.
- Frontend: TypeScript passed and 4 auth-flow regression tests passed. Server TypeScript and Docker builds passed.
- Additive migration deployed to main and dedicated test databases. API and web returned HTTP 200; backend and worker started successfully.
- Browser: new name/phone registration, development OTP, optional contact/ID save, masked ID display, vehicle creation and map entry succeeded. Logout followed by phone login succeeded; a wrong code was rejected and the correct code in Arabic digits was accepted. No SMS was sent.
- Independent security/frontend review found no remaining blocking findings. Live provider delivery remains unverified until credentials and Palestinian delivery permissions are configured. Existing email-only admin requires a deliberate verified-phone migration.
