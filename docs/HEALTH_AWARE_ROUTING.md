# Health and accessibility profile

Authenticated users complete this step after OTP and before Home. Existing users
have a null completion marker and complete it on their next login. Completing,
declining consent, or deleting sets the marker; deletion does not repeat onboarding.
Settings links to the same editor. None and prefer not to disclose are exclusive;
the four other categories allow multiple selections. No diagnosis changes mobility
preferences or driving eligibility.

Apply the `20261106000000_health_profile` Prisma migration before running the new
backend. No data backfill or seed is needed. Health selections and mobility choices
are stored only with consent (version 1, with timestamp), in an owner-only profile
encrypted using AES-256-GCM with per-user authenticated data. The encryption key is
derived using HKDF from the existing server-only JWT_REFRESH_SECRET, with a separate
health-profile domain. Rotating that secret requires re-encrypting profiles first;
database backups must retain the corresponding secret through the normal secret
backup process. Health data is never added to User/auth responses, shared client
query caches, local persistent storage, or routing/AI inputs. API responses already
use Cache-Control: no-store. Deletion removes the profile row and withdraws consent;
retained infrastructure backups follow the operator's existing retention policy.

Routing loads only the owner's saved explicit mobility choices on every request,
including reroutes. OSRM motorway exclusion is requested for driving. Unsupported
exclusions fall back to a normal route with a visible warning. Geometry caches
separate excluded and ordinary routes. Smoother-road preference ranks alternatives
using non-demo, confirmed, unexpired hazard/construction reports within 80 metres
(five-minute scoring penalty per report); it does not measure pavement smoothness.
Existing checkpoint scoring and fastest/checkpoint-aware modes remain available.
No verified accessible-parking or step-free dataset exists, so those choices produce
explicit warnings instead of invented accessibility guarantees. An unavailable
router retains the existing non-navigable straight-line estimate with a warning.

Focused checks:

```sh
npx vitest run --config vitest.health.config.ts
cd server
npm test -- tests/healthProfile.test.ts tests/healthRouting.test.ts tests/walking.test.ts
```

Backend tests use only the dedicated `_test` database and Redis database 15,
with mocked email delivery and routing providers.
