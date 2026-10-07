# Twilio Verify trial implementation plan

**Goal:** Let the user test real OTP messages on their verified Palestinian phone with Twilio's free trial, without upgrading or buying a sender.

**Design:** Keep the existing app request/verify contract and account/profile flow. Add `SMS_PROVIDER=twilio-verify` with a server-only Verify Service SID. Twilio generates and checks the code through its trial-compatible APIs. Redis still owns the application's five-minute challenge, send quotas, attempt budget and single-use session gate. A short per-phone operation lease serializes remote operations; stale responses cannot approve a replaced challenge. Existing development and Programmable Messaging modes remain supported.

**Constraints:** The user has no Twilio account yet. Do not sign up, accept external terms, upgrade billing, transmit a real SMS or invent credentials. Keep the active local provider until the user supplies settings privately in server/.env. External checks are tested with fetch fixtures; Redis/PostgreSQL remain real. No parallel test processes because the existing setup resets the same dedicated test database and Redis DB15.

## Tasks
- [x] Provider: add trial-compatible start/check requests, strict account/service/recipient/verification response matching, safe failure handling and env validation. Write failing provider tests before implementation.
- [x] Authentication: tests for external approval, rejection, expiry, lockout across resends, concurrency and stale results. Implement stored provider identity and atomic check reservation/consumption, preserving local OTP behavior.
- [x] Setup: Arabic trial instructions, example variables and honest free-tier limits; no message body/sender customization or paid account requirement.
- [x] Verify: focused RED/GREEN, full server suite, typecheck/build, independent security review and local service health. Report actual delivery pending account/credentials.

## Important behavior
- Only a current, ready challenge plus a matching approved response can issue a session.
- Check reservations count against the five-attempt budget, including uncertain provider failures; successful verification clears the budget.
- Invalid fifth check locks the phone for 15 minutes; a correct fifth check may succeed.
- Provider outages, pending statuses, malformed responses and expired operation leases never authenticate.
- Resends replace the local challenge ID, but Twilio may reuse the same OTP during its own validity period.
- Trial setup uses the Service SID shown in the Try out Verify API example. Live trial account credentials are different from non-delivering test credentials.

Sources: [trial Verify](https://www.twilio.com/docs/usage/trials/try-out-verify), [verification start](https://www.twilio.com/docs/verify/api/verification), [verification check](https://www.twilio.com/docs/verify/api/verification-check).

## Execution evidence

- Provider RED then GREEN: 31 tests. Authentication integration RED: all 10 new cases returned 503 before the mode existed; GREEN: 35 existing/new phone cases passed together.
- Final complete server suite: 13 files, 170 tests passed (205.79s). TypeScript passed on a sequential retry after a concurrent local process exhausted memory; Docker TypeScript build passed as well.
- Backend/worker images rebuilt and started. API `/health` and web returned HTTP 200. No database migration required for this change.
- Independent read-only security review found no blocking issue. Provider transport was simulated in tests; actual SMS delivery has not been tested because the user has not created the trial account yet.
- Local `server/.env` contains blank account/token/service fields and still selects `development`. No credentials, paid upgrade, provider account or external SMS was created.
