import { Platform, type ViewStyle } from 'react-native';

type Level = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const ios: Record<Level, ViewStyle> = {
  none: {},
  xs: { shadowColor: '#0B1F1A', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  sm: { shadowColor: '#0B1F1A', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  md: { shadowColor: '#0B1F1A', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  lg: { shadowColor: '#0B1F1A', shadowOpacity: 0.14, shadowRadius: 28, shadowOffset: { width: 0, height: 14 } },
  xl: { shadowColor: '#0B1F1A', shadowOpacity: 0.2, shadowRadius: 40, shadowOffset: { width: 0, height: 20 } },
};

const android: Record<Level, ViewStyle> = {
  none: {},
  xs: { elevation: 1 },
  sm: { elevation: 3 },
  md: { elevation: 6 },
  lg: { elevation: 10 },
  xl: { elevation: 16 },
};

const web: Record<Level, ViewStyle> = {
  none: {},
  xs: { boxShadow: '0 1px 3px rgba(11,31,26,0.06)' } as ViewStyle,
  sm: { boxShadow: '0 4px 14px rgba(11,31,26,0.08)' } as ViewStyle,
  md: { boxShadow: '0 8px 24px rgba(11,31,26,0.10)' } as ViewStyle,
  lg: { boxShadow: '0 14px 34px rgba(11,31,26,0.14)' } as ViewStyle,
  xl: { boxShadow: '0 20px 48px rgba(11,31,26,0.20)' } as ViewStyle,
};

export const shadow: Record<Level, ViewStyle> = Platform.select({
  ios,
  android,
  default: web,
}) as Record<Level, ViewStyle>;

/** Coloured glow for the primary CTA — used sparingly. */
export const brandGlow: ViewStyle = Platform.select({
  ios: { shadowColor: '#0A8F5F', shadowOpacity: 0.32, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 8, shadowColor: '#0A8F5F' },
  default: { boxShadow: '0 8px 22px rgba(10,143,95,0.30)' } as ViewStyle,
}) as ViewStyle;

export type ShadowLevel = Level;
