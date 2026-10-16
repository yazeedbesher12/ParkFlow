# SMTP email verification setup

Email verification is the normal registration and sign-in flow for customers,
administrators and parking operators. Registration is name -> email -> emailed
six-digit code -> profile details -> optional vehicle setup (customer only).
Returning accounts enter their email and code without a password. Staff accounts
retain their assigned roles; new registrations are ordinary accounts.

التسجيل والدخول الآن بالبريد ورمز يصله عبر البريد. الهاتف غير مطلوب للدخول،
وطرق إرسال وفحص SMS موقوفة في وضع البريد. حساب الأدمن وأصحاب المواقف يستخدم
نفس التحقق، ثم يفتح مساحة العمل حسب الصلاحيات الموجودة.

## Configure delivery

1. For Gmail, enable two-step verification on the sending account and create an
   [App Password](https://support.google.com/accounts/answer/185833).
2. Put the password only in the private `server/.env`, as `SMTP_PASSWORD`.
   Never place credentials in `EXPO_PUBLIC_*` variables or commit the populated file.
3. Configure the sender in `server/.env`:

   ```dotenv
   EMAIL_PROVIDER=smtp
   AUTH_LOGIN_METHOD=email
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
spaces. For another SMTP provider, change the host, port and TLS settings. For
port 587, set `SMTP_SECURE=false`; the adapter still requires STARTTLS.
The adapter is `server/src/providers/email.ts`; transport options follow
[Nodemailer SMTP configuration](https://nodemailer.com/smtp).

After changing environment settings, run this from `server`:

```powershell
docker compose up -d --force-recreate backend worker
```

For full project setup, ports and database configuration, see [README.md](README.md).
Do not overwrite a configured `.env` with the example.

## Verification API

Registration: `POST /api/v1/auth/request-otp` with
`{"email":"recipient@example.com","purpose":"register","fullName":"New User"}`.
Sign-in uses `{"email":"recipient@example.com","purpose":"login"}`. A login for
an unknown address does not create an account. The response contains `challengeId`,
`email`, `resendAfterSeconds` and `expiresAt`.

Verify: `POST /api/v1/auth/verify-otp` with
`{"challengeId":"<id>","code":"<received code>"}`. Successful verification
returns the existing access and refresh token response.

Codes expire after five minutes and are consumed once. Resend is available after
60 seconds and invalidates the previous challenge. Five wrong attempts across
resends lock the address for 15 minutes. Sends are limited to five per hour and
ten per day per address, with additional IP limits. Redis stores keyed OTP hashes
and hashed address budget keys. A challenge cannot verify before delivery succeeds.
SMTP failures clear that request's challenge and cooldown while retaining send
accounting; they do not sign
in the user or reveal the code. Acceptance by SMTP does not guarantee inbox
placement, so test with a real recipient and check the spam folder.

## Existing accounts

Profile contact addresses from older accounts are not automatically trusted as
login identities. An unverified legacy address requires an ownership check before
it can be linked for real email authentication; the backend returns
`EMAIL_MIGRATION_REQUIRED` for that situation. Do not merge accounts or grant
roles based only on a matching email.

A correct code can therefore be consumed before an account-policy error is
returned. The verification screen distinguishes an existing account that needs
reviewed email linking from a verified login address with no account
(`EMAIL_ACCOUNT_NOT_FOUND`). Neither error means that the entered code was wrong,
and neither signs in or creates a user. After an approved linking operation,
request a fresh code through the application.

Ordinary accounts use the customer application on port 8081. The management
portal on port 8082 requires an existing administrator or parking operator role;
email verification does not grant those roles.

Development-created email accounts remain unverified. Successful real email
verification clears their internal pending state; normal legacy account
protections remain in place. Restoring phone sign-in also requires an appropriate
verified phone and account-linking process for accounts created without a phone.

For a new local development administrator, configure `SEED_ADMIN_EMAIL` with a
real receiving address before seeding. Seeding does not promote an existing
ordinary account. A sample address such as `admin@parkflow.local` cannot receive
public email. Changing an existing administrator's sign-in identity requires an
explicit, reviewed ownership/linking process; do not automatically move its role
to the sending mailbox or merge it with another account.

Verified primary login email is read-only in profile forms. Profile completion
and identity details accept email verification without phone verification. Old
development email sessions stop working when the bypass is disabled; pending
development accounts can establish a real session by verifying their email.

## Testing

Run `npm run typecheck` in the project root and `server`. Backend tests require a
dedicated `TEST_DATABASE_URL` whose database name ends in `_test`, and use Redis
database 15. Run `node scripts/migrate-test.cjs` and `npm test` from `server`.
Tests intercept email delivery so no real emails are sent. Test actual SMTP
delivery separately after configuring the private credentials.
