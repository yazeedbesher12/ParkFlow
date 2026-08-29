import { Platform, type TextStyle } from 'react-native';

/**
 * Plus Jakarta Sans is loaded at boot and covers Latin plus the shekel sign.
 * Scripts it does not carry (Arabic) are substituted per glyph by the platform's
 * own text engine, so no explicit fallback stack is needed here — and React
 * Native could not parse a comma-separated list on device anyway.
 */
export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const systemFallback = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
}) as string;

export type FontWeightToken = keyof typeof fontFamily;

export type TypographyVariant =
  | 'displayXl'
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'titleLg'
  | 'title'
  | 'bodyLg'
  | 'body'
  | 'bodySm'
  | 'label'
  | 'caption'
  | 'overline'
  | 'button'
  | 'buttonSm';

type VariantStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'letterSpacing' | 'textTransform'> & {
  weight: FontWeightToken;
};

export const typography: Record<TypographyVariant, VariantStyle> = {
  /** The active-parking timer. Tabular figures are applied by AppText. */
  displayXl: { fontSize: 52, lineHeight: 58, letterSpacing: -1.6, weight: 'extrabold' },
  display: { fontSize: 36, lineHeight: 42, letterSpacing: -1, weight: 'extrabold' },
  h1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6, weight: 'bold' },
  h2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4, weight: 'bold' },
  h3: { fontSize: 18, lineHeight: 24, letterSpacing: -0.2, weight: 'bold' },
  titleLg: { fontSize: 17, lineHeight: 23, letterSpacing: -0.2, weight: 'semibold' },
  title: { fontSize: 15, lineHeight: 21, letterSpacing: -0.1, weight: 'semibold' },
  bodyLg: { fontSize: 16, lineHeight: 24, weight: 'regular' },
  body: { fontSize: 15, lineHeight: 22, weight: 'regular' },
  bodySm: { fontSize: 13, lineHeight: 19, weight: 'regular' },
  label: { fontSize: 13, lineHeight: 18, letterSpacing: -0.05, weight: 'semibold' },
  caption: { fontSize: 12, lineHeight: 16, weight: 'medium' },
  overline: { fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase', weight: 'bold' },
  button: { fontSize: 16, lineHeight: 20, letterSpacing: -0.2, weight: 'bold' },
  buttonSm: { fontSize: 14, lineHeight: 18, letterSpacing: -0.1, weight: 'bold' },
};

/** Caps text growth so premium layouts survive large accessibility text sizes. */
export const maxFontSizeMultiplier = 1.35;
