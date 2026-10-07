export interface TariffWindow {
  validFrom: Date;
  validTo: Date | null;
}

export function getActiveTariff<T extends TariffWindow>(tariffs: readonly T[], now = new Date()): T | undefined {
  return tariffs.find((tariff) => tariff.validFrom <= now && (tariff.validTo === null || tariff.validTo > now));
}
