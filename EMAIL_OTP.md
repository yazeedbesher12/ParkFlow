# SMTP email verification setup

Phone verification is the primary normal onboarding flow. SMTP email verification
remains available in the backend. During temporary development email sign-in,
code request and verification endpoints are paused. See [PHONE_AUTH.md](PHONE_AUTH.md)
for the active development flow and how to restore verification.

## Configure delivery

1. For Gmail, enable two-step verification on the sending account and create an
   [App Password](https://support.google.com/accounts/answer/185833).
2. Put the password only in the private `server/.env`, as `SMTP_PASSWORD`.
   Never place credentials in `EXPO_PUBLIC_*` variables or commit the populated file.
3. Configure the sender in `server/.env`:

   ```dotenv
   EMAIL_PROVIDER=smtp
   EMAIL_FROM=your-email@example.com
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=your-email@example.com
   SMTP_PASSWORD=
   DEV_SKIP_EMAIL_OTP=false
   DEV_SKIP_PHONE_OTP=false
   ```

Replace the example address and supply the App Password without its display
spaces. For another SMTP provider, change the host, port and TLS settings.
The adapter is `server/src/providers/email.ts`; transport options follow
[Nodemailer SMTP configuration](https://nodemailer.com/smtp).

After changing environment settings, run this from `server`:

```powershell
docker compose up -d --force-recreate backend worker
```

For full project setup, ports and database configuration, see [README.md](README.md).
Do not overwrite a configured `.env` with the example.

## Verification API

Request: `POST /api/v1/auth/request-otp` with
`{"email":"recipient@example.com"}`. The response contains `challengeId`,
`email`, `resendAfterSeconds` and `expiresAt`.

Verify: `POST /api/v1/auth/verify-otp` with
`{"challengeId":"<id>","code":"<received code>"}`. Successful verification
returns the existing access and refresh token response.

Codes expire after five minutes, allow five failed attempts, and are consumed
once. Resend is available after 60 seconds. Redis stores OTP hashes. SMTP delivery
failures return an error and clear the challenge and cooldown; they do not sign
in the user or reveal the code. Acceptance by SMTP does not guarantee inbox
placement, so test with a real recipient and check the spam folder.

## Existing accounts

Profile contact addresses from older accounts are not automatically trusted as
login identities. An unverified legacy address requires an ownership check before
it can be linked for real email authentication; the backend returns
`EMAIL_MIGRATION_REQUIRED` for that situation. Do not merge accounts or grant
roles based only on a matching email.

Development-created email accounts remain unverified. Successful real email
verification clears their internal pending state; normal legacy account
protections remain in place. Restoring phone sign-in also requires an appropriate
verified phone and account-linking process for accounts created without a phone.

For a new local development administrator, configure `SEED_ADMIN_EMAIL` before
seeding. Seeding does not promote an existing ordinary account.

## Testing

Run `npm run typecheck` in the project root and `server`. Backend tests require a
dedicated `TEST_DATABASE_URL` whose database name ends in `_test`, and use Redis
database 15. Run `node scripts/migrate-test.cjs` and `npm test` from `server`.
Tests intercept email delivery so no real emails are sent. Test actual SMTP
delivery separately after configuring the private credentials.
