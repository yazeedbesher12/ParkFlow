/**
 * Deterministic parking option score shared by map cards and server ranking.
 * Missing inputs contribute zero so a partial API response remains safe to
 * render. The component values mirror `server/src/modules/routing/service.ts`.
 */
export interface ParkingScoreInput {
  driveSeconds?: number | null;
  walkMeters?: number | null;
  price?: number | null;
  confidence?: number | null;
  accessibility?: boolean | null;
  evCompatible?: boolean | null;
}

export function scoreParkingOption(input: ParkingScoreInput): number {
  const n = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
  const drive = n(input.driveSeconds);
  const walk = n(input.walkMeters);
  const price = n(input.price);
  const time = drive == null ? 0 : Math.max(0, 30 - drive / 120);
  const walking = walk == null ? 0 : Math.max(0, 20 - walk / 50);
  const priceScore = price == null ? 0 : Math.max(0, 20 - price / 25);
  const confidence =
    input.confidence == null
      ? 0
      : Math.round(Math.min(1, Math.max(0, input.confidence)) * 20);
  const accessibility = input.accessibility === true ? 5 : 0;
  const ev = input.evCompatible === true ? 5 : 0;
  return Math.round((time + walking + priceScore + confidence + accessibility + ev) * 100) / 100;
}
