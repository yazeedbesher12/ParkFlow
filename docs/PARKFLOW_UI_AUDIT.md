# PARKFLOW UI audit

Application-wide visual inventory for the premium refinement branch. Discovery was performed from the complete Expo Router tree, shared UI primitives, map overlays, sheets and role-gated surfaces. The detailed render history and access blockers remain in [`FRONTEND_SCREEN_AUDIT.md`](./FRONTEND_SCREEN_AUDIT.md); this file is the current delivery ledger.

## Design-system findings

- **Identity:** the emerald, ink and brass language is distinctive and retained. The refinement reduces visual weight instead of adding decorative effects.
- **Typography:** Arabic uses IBM Plex Sans Arabic and English uses Plus Jakarta Sans. Display and page-title sizes were tightened to improve rhythm on 320–430 px screens.
- **Surfaces:** cards, fields and controls now use more disciplined radii, quieter borders and a warmer porcelain canvas.
- **Interaction:** shared press, hover, focus, loading and reduced-motion behavior is preserved across every route.
- **Responsive strategy:** phones remain edge-to-edge; large web viewports use an intentional branded application stage rather than stretching mobile workflows into sparse desktop canvases.

## Screen inventory

Status key: **Refined** = directly reviewed or receives the complete shared-system pass. **Blocked visual** = code reviewed and shared system applied, but the state needs seeded data, a live session, hardware or a privileged role for rendered verification.

| Route / component | Parent surface | Prior condition | Required improvement | Redesign | Visual verification |
|---|---|---|---|---|---|
| `/(onboarding)/welcome` | Public entry | Premium, earlier overflow issue | Responsive RTL composition and restrained motion | Refined | Verified previously at mobile/web |
| `/(onboarding)/email` | Onboarding | Polished | Shared field density and focus treatment | Refined | Verified previously |
| `/(onboarding)/otp` | Onboarding | Polished | Shared typography and control proportions | Refined | Verified previously |
| `/(onboarding)/name` | Onboarding | Polished | Shared typography and field proportions | Refined | Verified previously |
| `/(onboarding)/vehicle` | Onboarding | Polished | Shared card/button system | Refined | Verified previously |
| `/(tabs)/map` | Map tab | Dense but polished | Quieter floating chrome, compact search and tab bar | Refined | Verified previously |
| `/(tabs)/share` | Share tab | Polished | Tighter card proportions and type scale | Refined | Verified previously |
| `/(tabs)/activity` | Activity tab | Polished | Consistent list rhythm and states | Refined | Verified previously |
| `/(tabs)/vehicles` | Vehicles tab | Polished | Consistent cards, empty states and actions | Refined | Verified previously |
| `/(tabs)/wallet` | Wallet tab | Polished | Harmonized hero/card proportions | Refined | Verified previously |
| `/(tabs)/profile` | Profile tab | Polished | Consistent list hierarchy and destructive action treatment | Refined | Verified previously |
| `/notifications` | Map / Profile | Polished | Shared list, badge, loading and error states | Refined | Verified previously |
| `/roads` | Map / Profile | Polished | Dense information hierarchy and status tokens | Refined | Verified previously |
| `/scan` | Map entry tools | RTL inconsistency | Direction-aware composition and shared controls | Refined | Verified previously |
| `/activity/[id]` | Activity | Data-dependent | Shared detail rows and surface hierarchy | Refined | Blocked visual: no activity data |
| `/parking/start` | Parking | Polished | Refined form density and CTA hierarchy | Refined | Verified previously |
| `/parking/layout/[zoneId]` | Parking | Visually heavy | Softer status tints and clearer selected state | Refined | Verified previously |
| `/parking/reserve/[zoneId]` | Parking | Inconsistent stepper | Shared stepper and compact controls | Refined | Verified previously |
| `/parking/reservations` | Profile / Parking | Inconsistent tabs | Inset segmented control and card rhythm | Refined | Verified previously |
| `/parking/active/[id]` | Parking | Session-dependent | Shared timer, actions and status hierarchy | Refined | Blocked visual: live session required |
| `/parking/receipt/[id]` | Parking | Session-dependent | Receipt hierarchy and numeric typography | Refined | Blocked visual: completed session required |
| `/parking/reservation/[id]` | Parking | Data-dependent | Detail hierarchy and action states | Refined | Blocked visual: reservation required |
| `/vehicles/add` | Vehicles | Polished | Shared fields and CTA proportions | Refined | Verified previously |
| `/vehicles/warning-check` | Vehicles | Polished | Shared informational and result states | Refined | Verified previously |
| `/vehicles/[id]` | Vehicles | Data-dependent | Shared detail hierarchy and sheets | Refined | Blocked visual: vehicle required |
| `/wallet/methods` | Wallet | Polished | Shared cards and action sheets | Refined | Verified previously |
| `/wallet/add-card` | Wallet | Polished | Compact fields and secure-form hierarchy | Refined | Verified previously |
| `/wallet/topup` | Wallet | Polished | Numeric emphasis and option hierarchy | Refined | Verified previously |
| `/profile/personal` | Profile | Polished | Shared field and disabled-state treatment | Refined | Verified previously |
| `/profile/points` | Profile | Polished | Numeric hierarchy and reward cards | Refined | Verified previously |
| `/profile/settings` | Profile | Polished | Consistent switches, rows and groups | Refined | Verified previously |
| `/profile/help` | Profile | Inconsistent decoration | Quieter FAQ hierarchy | Refined | Verified previously |
| `/profile/about` | Profile | Polished | Brand hierarchy and readable copy width | Refined | Verified previously |
| `/rides/mine` | Share | Polished | Shared cards and empty states | Refined | Verified previously |
| `/rides/new` | Share | Heavy stepper | Recessed shared stepper and tighter form rhythm | Refined | Verified previously |
| `/rides/[id]` | Share | Data-dependent | Shared detail and booking controls | Refined | Blocked visual: ride required |
| `/spots/mine` | Share | Polished | Shared cards and empty states | Refined | Verified previously |
| `/spots/new` | Share | Inconsistent fields | Unified fields and compact steppers | Refined | Verified previously |
| `/spots/[id]` | Share | Data-dependent | RTL-safe chips and booking hierarchy | Refined | Blocked visual: spot required |
| `/violations` | Profile | Polished | Shared status/list hierarchy | Refined | Verified previously |
| `/violations/[id]` | Violations | Data-dependent | Detail hierarchy and action states | Refined | Blocked visual: violation required |
| `/violations/appeal/[id]` | Violations | Data-dependent | Shared form and submission states | Refined | Blocked visual: violation required |
| `/violations/evidence/[id]` | Violations | Data-dependent | Evidence framing and metadata hierarchy | Refined | Blocked visual: violation required |
| `/gate` | Staff | Role-gated | Operational hierarchy and shared controls | Refined | Blocked visual: gate role required |
| `/gate/pass` | Profile / Gate | Polished | Status and pass hierarchy | Refined | Verified previously |
| `/gate/patrol` | Staff | Role-gated | Compact operational controls | Refined | Blocked visual: patrol role required |
| `/management` | Admin | Role-gated | Dashboard hierarchy via shared system | Refined | Blocked visual: admin role required |
| `/management/analytics` | Admin | Role-gated | Chart/card rhythm and numeric hierarchy | Refined | Blocked visual: admin role required |
| `/management/smartgate` | Admin | Role-gated | Live-monitor hierarchy and status tokens | Refined | Blocked visual: admin role required |
| `/management/staff` | Admin | Role-gated | Dense rows, controls and sheets | Refined | Blocked visual: admin role required |
| `/management/zones` | Admin | Role-gated | Editor grouping and control density | Refined | Blocked visual: admin role required |
| `+not-found` | Public fallback | Polished | Shared empty-state hierarchy | Refined | Verified previously |

## Significant overlays and states

| Surface | Current treatment | Verification |
|---|---|---|
| Cold-start intro | Brief logo reveal, no artificial delay, reduced-motion aware | Verified previously |
| Bottom tab bar | Compact glass surface with restrained active motion | Shared pass applied |
| Map search, top bar and control rail | Smaller controls and consistent floating-surface depth | Shared pass applied |
| Nearby parking, destination and route panels | Clear information priority with map visibility preserved | Verified previously |
| Zone, vehicle, layer, EV, service and tourism sheets | Shared sheet radius, handle, spacing and action hierarchy | Mixed: data-dependent surfaces noted in detailed audit |
| Road report create/detail sheets | RTL-safe rows and shared fields | Create verified; detail data-dependent |
| Navigation overlay and steps | Full-screen priority with compact information surfaces | Main overlay verified previously |
| Loading, empty, error, success and disabled states | Shared accessible components and semantic status labels | Code reviewed across system |

## Verification policy

No blocked row is treated as rendered. The blockers are test data, live-session, hardware and role requirements—not visual code omissions. Database seeding was intentionally not performed because it would mutate developer data.
