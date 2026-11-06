import type { User } from '@/types';

export function afterVerificationRoute(user: Pick<User, 'fullName' | 'healthProfileCompletedAt'>) {
  if (!user.healthProfileCompletedAt) return '/(onboarding)/health' as const;
  return user.fullName ? '/(tabs)/map' as const : '/(onboarding)/name' as const;
}
