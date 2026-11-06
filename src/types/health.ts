export const HEALTH_CONDITIONS = ['diabetes', 'hypertension', 'other_chronic', 'disability', 'none', 'prefer_not_to_disclose'] as const;
export type HealthCondition = typeof HEALTH_CONDITIONS[number];
export const MOBILITY_KEYS = ['avoidHighways', 'preferSmootherRoads', 'accessibleParking', 'stepFreeAccess'] as const;
export type MobilityPreferences = Record<typeof MOBILITY_KEYS[number], boolean>;
export interface HealthProfileInput {
  conditions: HealthCondition[];
  mobility: MobilityPreferences;
  consent: boolean;
}
export interface HealthProfile extends HealthProfileInput {
  consentedAt: string;
  consentVersion: 1;
}
export const EMPTY_MOBILITY: MobilityPreferences = {
  avoidHighways: false, preferSmootherRoads: false, accessibleParking: false, stepFreeAccess: false,
};
export function toggleHealthCondition(selected: HealthCondition[], next: HealthCondition): HealthCondition[] {
  if (selected.includes(next)) return selected.filter(item => item !== next);
  if (next === 'none' || next === 'prefer_not_to_disclose') return [next];
  return [...selected.filter(item => item !== 'none' && item !== 'prefer_not_to_disclose'), next];
}
