# Phone registration and sign-in

Registration: name -> Palestinian mobile (+970) -> six-digit code -> optional contact email/national ID -> vehicle. Returning users enter the phone and code without a password. New accounts are created only after successful verification. An unfinished account resumes its details step on another device.

## الوضع الحالي: دخول البريد مؤقتاً للتطوير والفحص

الهاتف والرموز معلّقان الآن في نسخة التطوير. ضع في `server/.env`:

```dotenv
NODE_ENV=development
DEV_SKIP_EMAIL_OTP=true
DEV_SKIP_PHONE_OTP=false
```

من مجلد `server`، أعد تشغيل الخادم والمهام الخلفية بعد بناء الكود المحدّث:

```powershell
docker compose up -d --force-recreate backend worker
```

افتح `/email` أو اختر «تسجيل الدخول» من الترحيب. أدخل بريد الحساب ثم «متابعة»، دون كلمة مرور أو رمز. التسجيل الجديد يبدأ بالاسم ثم البريد وإكمال البيانات والمركبة. يحتفظ الحساب الموجود باسمه وصلاحياته وبياناته؛ ولا تُمنح صلاحيات أدمن أو مالك لمجرد تسجيل بريد جديد. يعمل حساب الأدمن الموجود `admin@parkflow.local` بهذا المسار. يُنشأ الحساب الجديد كمستخدم عادي، ويبقى البريد غير موثّق حتى تحقق حقيقي.

يتحكم الخادم بالمسار، والبريد له الأولوية إذا فُعّل الخياران معاً. طرق الهاتف والإرسال والفحص القديمة تتوقف أثناء وضع البريد؛ تبقى بيانات المزود والرموز وحدودها محفوظة. هذا الدخول مخصص لنسخة تطوير موثوقة، إذ يكفي معرفة البريد للدخول.

لإعادة الهاتف والرموز، اضبط الخيارين `DEV_SKIP_EMAIL_OTP=false` و`DEV_SKIP_PHONE_OTP=false` وأعد التشغيل بالأمر نفسه. تعود شاشة الهاتف ويُرفض استخدام جلسات البريد المؤقتة، حتى بعد تجديدها. تبقى الحسابات والبيانات الموجودة محفوظة؛ الحساب التجريبي الجديد بلا هاتف يحتاج ربطاً وتحققاً من هويته قبل استعماله في التشغيل الفعلي. لا يُسمح بتفعيل أي من هذين الخيارين في بيئة الإنتاج. لا يلزم تغيير متغيرات الواجهة العامة.

## إيقاف الرموز مؤقتاً أثناء تطوير التطبيق

للسماح للفريق بالدخول دون رسالة في بيئة التطوير الموثوقة، ضع في `server/.env`:

```dotenv
NODE_ENV=development
DEV_SKIP_PHONE_OTP=true
```

ثم أعد تشغيل الخادم والمهام الخلفية من مجلد `server`:

```powershell
docker compose up -d --force-recreate backend worker
```

تعرض شاشة الهاتف «دخول مؤقت للتطوير». التسجيل: الاسم ثم رقم الهاتف ثم إكمال البيانات. الدخول: رقم الحساب ثم متابعة، دون رمز أو كلمة مرور. يحتفظ الحساب بصلاحياته الحالية، ويُنشأ الحساب الجديد كمستخدم عادي. يُحفظ الرقم الجديد كغير موثّق حتى يصل لاحقاً رمز صحيح. لا تعمل طرق إرسال الرموز القديمة أثناء هذا الوضع، ولا يُغيَّر إعداد مزود SMS أو حدوده.

لإعادة التحقق، غيّر `DEV_SKIP_PHONE_OTP=false` وأعد التشغيل بالأمر نفسه. تُرفض جلسات الدخول المؤقتة، وتعود شاشة الرموز وحدود المحاولات الأصلية. يستطيع الحساب الذي أُنشئ خلال التطوير توثيق رقمه عبر المسار الأصلي مع الحفاظ على بياناته. يرفض الخادم بدء بيئة الإنتاج إذا كان هذا الإعداد مفعلاً. يستخدم التطبيق إعداد الخادم مباشرة؛ لا يلزم إضافة مفتاح عام في الواجهة. اجعل نسخة التطوير مقتصرة على الفريق الموثوق، لأن الدخول فيها يعتمد على معرفة رقم الحساب.

## Local development

For terminal-only development, use `SMS_PROVIDER=development`. Codes are printed in the **server terminal only**, labelled `ParkFlow development SMS`; nothing is sent to a phone. With Docker, read the newest line using `docker compose logs --tail 30 backend` from `server`. Enter its six-digit code on the verification screen. There is no universal code, and limits still apply. The app shows a development-delivery notice. With `twilio-verify`, obtain the code from the SMS instead; it is never printed locally.

`DEV_SKIP_EMAIL_OTP=true` selects the temporary email flow described above. Keep it false for terminal-code development or real phone verification. Production rejects development delivery and development login.

## تفعيل رسائل حقيقية عبر تجربة Twilio Verify المجانية

لتفعيل الإرسال الحقيقي، أنشئ حسابك وأضف بياناته إلى `server/.env` وفق الخطوات التالية. لا تحتاج إلى ترقية مدفوعة لتنفيذ هذه التجربة. قبول طلب التحقق من المزود لا يؤكد وصوله إلى الهاتف؛ تحقق من وصول الرسالة عند تجربة الربط.

1. أنشئ حسابًا من [Twilio](https://www.twilio.com/try-twilio)، وأكمل توثيق البريد والهاتف الفلسطيني بصيغة `+970`؛ مثل `+970599123456`. يمكن بدء التجربة دون بطاقة دفع. فلسطين مدرجة ضمن الدول المتاحة، والإرسال التجريبي مقيد بدولة رقم التسجيل. [شروط التجربة الرسمية](https://www.twilio.com/docs/usage/trials).
2. افتح `Identity > Verify > Overview > Try out Verify`، واختر SMS. وثّق رقم الاختبار بإدخال الرمز الذي يصل إليه. استعمل الخدمة التجريبية المعروضة، وانسخ `Service SID` الذي يبدأ بـ `VA` من مثال طلب API في الصفحة؛ لا يلزم إنشاء خدمة إضافية قد تطلب ترقية. [دليل Verify التجريبي](https://www.twilio.com/docs/usage/trials/try-out-verify).
3. انسخ `Account SID` و`Auth Token` الحقيقيين لحسابك التجريبي، وليس **Test Credentials**؛ الأخيرة تحاكي الطلبات ولا ترسل إلى هاتف حقيقي. [وثائق بيانات الاختبار](https://www.twilio.com/docs/iam/test-credentials).
4. ضع القيم في `server/.env` فقط، ولا ترسل الرمز السري في المحادثة أو تضفه إلى متغيرات `EXPO_PUBLIC_*`:

```dotenv
SMS_PROVIDER=twilio-verify
TWILIO_ACCOUNT_SID=AC_REPLACE_WITH_32_HEX_CHARACTERS
TWILIO_AUTH_TOKEN=REPLACE_WITH_YOUR_ACCOUNT_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID=VA_REPLACE_WITH_32_HEX_CHARACTERS
```

هذه أمثلة مكانية؛ استبدلها كاملة. الشكل الصحيح هو `AC` أو `VA` متبوعًا مباشرة بـ 32 محرفًا سداسيًا عشريًا، دون شرطة سفلية. وضع Verify لا يحتاج `TWILIO_FROM`، وTwilio يتولى إنشاء الرمز وإرساله والتحقق منه.

5. بعد حفظ الإعدادات، نفّذ من مجلد `server` الأمر التالي لإعادة تحميل البيئة في الحاويات المبنية من الكود المحدّث:

```powershell
docker compose up -d --force-recreate backend worker
```

6. افتح ParkFlow وسجّل برقم الاختبار الموثق نفسه. سيطلب التطبيق إرسال رسالة فعلية؛ عند وصولها، أدخل رمزها في التطبيق. عند رفض الإرسال أو عدم وصول الرسالة، راجع `Verify Logs` في لوحة Twilio والرقم الموثق ودولة التسجيل والحصة المتبقية. لا تغيّر إلى خطة مدفوعة لمجرد إكمال الإعداد.

تتضمن التجربة **40 عملية تحقق ناجحة و100 رسالة SMS خلال 30 يومًا، وحتى 5 أرقام موثقة**. إرسال رمز SMS يستهلك من حصة الرسائل، والتحقق الصحيح يستهلك من حصة Verify. القيم قيود تجربة وليست خطة إرسال مجانية دائمة. [حصص التجربة](https://www.twilio.com/docs/usage/trials)، [قيود Verify](https://www.twilio.com/docs/usage/trials/try-out-verify).

### Other delivery modes

`SMS_PROVIDER=development` retains local terminal-only codes. `SMS_PROVIDER=disabled` fails closed. The existing `SMS_PROVIDER=twilio` adapter uses the [Messages API](https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource), requires `TWILIO_FROM`, and sends a custom ParkFlow message; use `twilio-verify` for the trial setup above because the current trial uses predefined Verify content. No production/development bypass is enabled by selecting Verify.

## Limits enforced by the server

| Limit | Value |
| --- | --- |
| Application challenge lifetime (per request) | 5 minutes |
| Wrong guesses / unsuccessful provider checks per phone, across resends | 5 within a rolling 15-minute inactivity window |
| Lock after the fifth failed attempt | 15 minutes |
| Resend wait | 60 seconds |
| Sends per phone | 5/hour and 10/day |
| Sends per IP | 10/10 minutes |
| Verification requests per IP | 30/10 minutes |

The application's challenge expires after **5 minutes**, including in Verify mode. Resending invalidates the previous local `challengeId` without resetting attempts. Twilio may resend the same digits during its own validity window; a repeated code does not make an old local challenge usable. [Twilio code validity](https://www.twilio.com/docs/verify/api/rate-limits-and-timeouts).

Local/custom-message codes are stored as keyed hashes; Verify owns its codes and ParkFlow checks them through the provider. Neither mode returns a code through the authentication API. Successful challenges are consumed once. Verify checks reserve an attempt before the network call, and an unsuccessful check or timeout conservatively consumes that attempt. A provider timeout can therefore require a new code or contribute to the 15-minute lock; it never authenticates the user.

Repeated delivery failures also consume the send quota. Unknown login numbers receive the same request response; an account-existence error is only shown after a valid code. Limits are shared through Redis. The deployment must correctly configure any trusted reverse proxy before relying on client-IP limits; this app currently uses the direct connection IP. Twilio account quotas and provider limits apply in addition to the app's limits.

## Personal details and existing accounts

Email is a contact address, initially unverified. It cannot automatically link or take over an existing account. National ID is optional (nine digits), encrypted with AES-256-GCM and tied to the account; API responses only show a masked suffix. Collecting the number does not perform government identity verification. `PROFILE_ENCRYPTION_KEY` must contain 64 random hex characters, remain on the server, and be backed up privately. Do not change it without a data/key migration.

Existing account IDs, roles, data and sessions are retained. A legacy phone recorded without verification is not accepted as proof of account ownership. Accounts with only email, including the old `admin@parkflow.local` seed, need a verified-phone migration before using the new phone UI. Do not grant admin rights to a newly created phone account merely because its contact email matches an administrator. Legacy email OTP API remains for already verified email accounts where SMTP is configured; the phone UI never uses it.

## Validation

Generate Prisma and apply `20261007000000_phone_profile` to the main and dedicated test databases before running the suites. The migration is additive and retains prior completed account setup. `npm run typecheck` in root and `server`, and `npm test` in `server`, cover the frontend types, real Redis/PostgreSQL security behavior, profile isolation, code replay and delivery boundaries. SMS transport is simulated in automated tests; no messages are sent.
