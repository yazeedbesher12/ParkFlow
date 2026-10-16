# Team/main integration design

User request: merge all our work and all team updates into a new branch, resolve conflicts, verify the project, publish a Pull Request for Yazeed, and verify the pushed revision still runs.

Inputs: our completed branch at 6c4c75e and latest fetched origin/main at b0be9e9. Their common ancestor is c6c6f3e; six commits are unique to ours and 27 to the team. Keep both histories through a merge commit. Original checkout stays untouched.

Keep the npm workspace architecture: apps/customer, apps/management, packages/client, packages/contracts, packages/design, and one server/database. Port team root app/src additions into these active locations. Preserve team routing/traffic, tourism, accessible parking, shared rides, private host spots, gates/overstay, report rewards/notifications, and Android crash detection. Preserve our staff management/appearance/trusted parking, verified email OTP, independent HttpOnly browser sessions, CSRF/origin checks, native SecureStore, account/GPS isolation, payment idempotency and dependency backports.

Merge Prisma models and migration histories without resets or removing data. Test migrations against a dedicated test database before applying safe migrations to the local live database; create a local backup before any live migration. No real messages, emergency calls or payments during tests. Do not commit secrets, local env files or generated private database backups.

Validation: route and feature inventory, all client/server/type/contract suites, frontend dependency verification, security regressions, customer/management web and customer Android/iOS exports, native-module autolinking checks, isolated migration checks, final independent source review, runtime API/frontend/socket checks, and a post-push remote-SHA check. Build and test heavy commands serially on this Windows host.

Publication: push only the new integration branch to the existing fork and create a PR to yazeedbesher12/ParkFlow main. Do not merge main, close existing PRs, force-push shared branches or publish a hosted deployment. Verify the same pushed SHA locally; report clearly that GitHub source publication is not internet hosting.