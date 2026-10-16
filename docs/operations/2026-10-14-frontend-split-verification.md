# Frontend split verification — 2026-10-14

The migration is on `codex/separate-apps-2026-10-14`, based on the preserved local
implementation at `b2325be`. Customer routes and components belong to
`apps/customer`; administrator/operator routes and components belong to
`apps/management`. Both use the existing server and database. Shared packages
contain contracts, design assets/tokens and the client SDK/common UI.

## Feature preservation and review

- All 274 original route, source and asset files have mapped destinations. The
  complete move also includes the four original frontend configuration files.
- An independent normalized comparison found 263 route/source/asset files
  unchanged apart from import paths and line endings. All binary assets match.
- The remaining 11 changes implement application-specific authentication and
  navigation, removal of embedded staff links, scoped management persistence,
  public runtime API configuration and refresh-session isolation.
- All eight administrator/operator feature routes remain available on the
  management origin. Customer native identifiers, plugins, permissions and
  Maps/push configuration are preserved.
- Shared packages do not import application code. Neither frontend imports the
  other frontend. Existing dependency versions and server dependency files remain
  unchanged; the frontend lock adds workspace links.
- Server implementation, schema, provider configuration, memberships, parking
  data and financial records were not changed by this migration.

## Automated verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | All five frontend/shared workspaces passed |
| `npm test` | 57 passed, 0 failed |
| `npm run test:contracts` | 22 passed across the focused client contract suites |
| Server TypeScript | Passed |
| Full server suite against its dedicated test database | 324 passed in 26 files |
| `npm run export:customer` | Web, Android and iOS exports succeeded |
| `npm run export:management` | Web export succeeded |

New regressions cover explicit role/profile destinations, independent sessions
over common browser storage, management onboarding, a stale refresh response
after a new login, runtime API configuration without ambient variables, and
Metro crawler/watcher boundaries. Failing cases were observed before their fixes.

The Windows Metro regression was reproduced while exports changed generated
files. Exclusions now cover absolute, relative and slash-normalized watcher
paths, and unrelated application roots are removed from `watchFolders`. Tests
exercise the installed `AbstractWatcher`. The customer preview subsequently
survived a management export and creation/removal of a temporary file in its own
`dist` directory.

## Local browser and service verification

- Customer `http://localhost:8081` and management `http://localhost:8082` run
  independently. The existing API on port 4000 reports ready; both frontend
  origins are accepted by backend CORS.
- Existing administrator sign-in opens `/admin` in management and `/map` in
  customer. Customer profile contains its ordinary account features without
  embedded staff navigation.
- The management overview loads the existing eight active accounts and 25 zones.
  Parking/organization management and appearance/content editing views load.
  English/Arabic switching and the desktop RTL layout were checked.
- Both sessions survive page reloads. Management logout returns to its welcome
  page while the customer session stays signed in after a reload.
- An existing ordinary demo account reaches `/access-denied`, including after
  direct navigation to `/admin`. It does not mount a staff workspace.
- Private environment files, generated exports, local diagnostics, screenshots
  and database backups remain excluded from Git.

## Practical limits

Native exports verify bundles, not physical-device installations. Compact portal
rendering still needs a manual phone/browser check: the available viewport tool
did not apply the requested dimensions to the portal tab. Operator authorization
and membership behavior are covered by the existing backend/client tests; live
browser checks used existing administrator and ordinary demo accounts without
creating or changing owner memberships. The customer smoke checked its map
screen, controls and marker data, not external base-map tile delivery.

Provider-dependent delivery and the development authentication configuration
retain their previous state. This migration does not change the pilot readiness
requirements documented in the README.
