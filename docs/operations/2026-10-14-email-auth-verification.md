# Email authentication verification — 2026-10-14

Normal customer, administrator and parking operator registration/sign-in uses
email and an emailed six-digit code. `AUTH_LOGIN_METHOD=email` is the default;
both development shortcuts are disabled in the running instance. Phone request,
verification and shortcut endpoints reject requests in this mode. Their existing
implementation remains available only when phone mode is explicitly configured.

## Behavior and security

- Customer registration is name -> email -> code -> profile -> optional vehicle.
  Staff welcome offers existing-account sign-in. Accounts and wallets are created
  only after verification; new registrations have role USER.
- Existing roles, memberships, wallet data and completed profiles are preserved.
  Unknown login addresses do not become new accounts after verification.
- Codes use cryptographic randomness, expire in five minutes, and are consumed
  once. Redis holds keyed hashes, not codes. Challenges remain in frontend memory,
  never in URLs or persisted form state.
- A 60-second resend cooldown, five sends/hour and ten/day per address, and the
  existing IP limits apply. Resend invalidates the previous challenge and retains
  failed-attempt accounting. Five wrong guesses lock an address for 15 minutes.
- Challenge preparation, replacement, readiness, consumption and budget/lock
  changes use atomic Redis operations. Pending/failed delivery cannot authenticate.
  Failed-provider cleanup cannot remove a later challenge; send budgets remain.
- Existing legacy contact emails require a reviewed ownership/linking process.
  A matching email cannot transfer roles or merge accounts.
- Email-verified users can complete profiles and update name/national ID without
  a phone. Identity values remain encrypted and only masked values are returned.
  Direct replacement/removal of a verified primary login email is rejected.
- Frontend verification rejects abandoned responses before persistence and checks
  again after an asynchronous secure write. Auth writes are serialized and newer
  sign-in/logout epochs invalidate older commits. Canceled writes are restored
  before a later auth write. Challenge cleanup survives OTP wrapper unmount.

## Verification performed

| Check | Result |
| --- | --- |
| Full frontend suite after account-error message correction | 100 passed, 0 failed |
| All five frontend/shared TypeScript workspaces | Passed |
| Full server suite on dedicated test DB and Redis DB 15 | 356 passed in 28 files |
| Server TypeScript and Docker backend/worker builds | Passed |
| Customer export | Web, Android and iOS succeeded |
| Management export | Web succeeded |
| Independent security review | No unresolved Critical/Important findings |

RED cases were observed for normal email configuration, email OTP screens,
registration/profile behavior, send/guess/readiness limits, and slow secure
persistence before implementing the fixes. The reviewer independently reproduced
the secure-persistence race and verified that the final implementation preserves
the newer account.

The running backend reports `loginMethod=email` with both bypass flags false.
Live valid requests to all three phone auth endpoints return 403
`AUTH_METHOD_DISABLED`; the email shortcut returns 403 `DEV_LOGIN_DISABLED`.
The common backend reports ready. Browser checks covered customer name/email
registration, customer sign-in, Arabic staff sign-in, and a failed delivery staying
on the email page without an authenticated session.

## Live delivery and account-policy diagnostics

The sender was configured privately for Gmail SMTP on port 465 with TLS and an
App Password. Transport verification authenticated successfully, and a live
request through the authentication API returned 200 after SMTP acceptance. The
user confirmed that the email arrived. Credentials were not added to tracked
files. Test suites still intercept delivery and do not send real email.

Live diagnostics also identified account-policy failures after correct-code
verification: unknown login addresses returned 404, while an unverified legacy
contact address returned 409. The frontend now displays separate account-missing
and account-linking messages rather than a generic code-verification failure.
The two regression assertions failed before the correction; the full frontend
suite passed afterward. Account-linking errors leave the user signed out and
preserve resend deadlines. No authentication check, role requirement, or OTP
limit was relaxed by this change.

After explicit user approval, the affected ordinary account was prepared for
fresh email verification through a guarded transaction. Its existing identity,
role, profile, wallet and related records were preserved, old sessions were
revoked, and the operation was audited. The email was not marked verified and
no session was issued by maintenance: a fresh code requested through the
customer application was required. The user subsequently confirmed that this
fresh sign-in worked; the account remains an ordinary USER with its existing data.

For the subsequent account-isolation fixes, private key rotation, current
dependency findings and final verification results, see the
[email settings security audit](../security/2026-10-14-email-settings-audit.md).

See [EMAIL_OTP.md](../../EMAIL_OTP.md) for setup and existing-account handling.

An address such as `admin@parkflow.local` cannot receive public email. Existing
administrator identity must be linked to a real receiving address through a
reviewed ownership process, preserving the intended account. Sender configuration
does not automatically grant administrator rights to the sending mailbox.

Native exports verify bundles; physical-device installation remains a separate
check. Local provider settings, backups, logs, screenshots and secrets are ignored
by Git. No phone/SMS request was sent to an external provider during verification.
