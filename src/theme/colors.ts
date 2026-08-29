/**
 * Brand identity: deep emerald + fresh parking green.
 * Every colour the app draws must come from here — never inline hex in screens.
 */

const palette = {
  // Deep emerald — brand identity, dark surfaces, splash, hero areas
  emerald950: '#03221B',
  emerald900: '#04352A',
  emerald800: '#065240',
  emerald700: '#076D53',
  emerald600: '#0A8F5F',
  emerald500: '#12B076',
  emerald400: '#22C58B',
  emerald300: '#5BDCAC',
  emerald200: '#9BEDCC',
  emerald100: '#D3F8E7',
  emerald50: '#EDFCF5',

  // Neutrals — very slightly green-tinted so they sit with the brand
  neutral900: '#0B1F1A',
  neutral800: '#152A25',
  neutral700: '#2C3F39',
  neutral600: '#475A54',
  neutral500: '#6B7C76',
  neutral400: '#8FA09A',
  neutral300: '#B7C4BF',
  neutral200: '#DCE4E1',
  neutral100: '#EDF2F0',
  neutral50: '#F6F8F7',
  white: '#FFFFFF',
  black: '#000000',

  amber600: '#B45309',
  amber500: '#F59E0B',
  amber100: '#FEF3C7',

  red600: '#C3282C',
  red500: '#E5484D',
  red100: '#FEE4E2',

  blue600: '#1D5FD1',
  blue500: '#2E7DF7',
  blue100: '#DBE9FE',

  violet500: '#7C5CFC',
  violet100: '#EAE4FF',
};

export type ColorScheme = {
  /** Brand */
  brand: string;
  brandPressed: string;
  brandSoft: string;
  brandSofter: string;
  onBrand: string;
  deep: string;
  deepAlt: string;
  onDeep: string;
  onDeepMuted: string;
  accent: string;

  /** Surfaces */
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  surfaceInverse: string;
  overlay: string;
  scrim: string;
  glass: string;
  glassBorder: string;

  /** Lines */
  border: string;
  borderStrong: string;
  divider: string;

  /** Text */
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  textOnColor: string;

  /** Status — availability + system feedback */
  success: string;
  successSoft: string;
  successText: string;
  warning: string;
  warningSoft: string;
  warningText: string;
  danger: string;
  dangerSoft: string;
  dangerText: string;
  info: string;
  infoSoft: string;
  infoText: string;
  neutralSoft: string;
  neutralText: string;

  /** Charts / map */
  mapWater: string;
  mapLand: string;
  skeleton: string;
  skeletonHighlight: string;
};

export const lightColors: ColorScheme = {
  brand: palette.emerald600,
  brandPressed: palette.emerald700,
  brandSoft: palette.emerald100,
  brandSofter: palette.emerald50,
  onBrand: palette.white,
  deep: palette.emerald900,
  deepAlt: palette.emerald950,
  onDeep: palette.white,
  onDeepMuted: 'rgba(255,255,255,0.66)',
  accent: palette.emerald400,

  background: palette.neutral50,
  surface: palette.white,
  surfaceAlt: palette.neutral100,
  surfaceSunken: palette.neutral100,
  surfaceInverse: palette.emerald900,
  overlay: 'rgba(11,31,26,0.45)',
  scrim: 'rgba(11,31,26,0.06)',
  glass: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(255,255,255,0.55)',

  border: palette.neutral200,
  borderStrong: palette.neutral300,
  divider: palette.neutral100,

  text: palette.neutral900,
  textSecondary: palette.neutral600,
  textTertiary: palette.neutral400,
  textInverse: palette.white,
  textOnColor: palette.white,

  success: palette.emerald500,
  successSoft: palette.emerald100,
  successText: palette.emerald700,
  warning: palette.amber500,
  warningSoft: palette.amber100,
  warningText: palette.amber600,
  danger: palette.red500,
  dangerSoft: palette.red100,
  dangerText: palette.red600,
  info: palette.blue500,
  infoSoft: palette.blue100,
  infoText: palette.blue600,
  neutralSoft: palette.neutral100,
  neutralText: palette.neutral600,

  mapWater: '#CFE3F5',
  mapLand: '#EDF0EE',
  skeleton: palette.neutral200,
  skeletonHighlight: palette.neutral100,
};

export const darkColors: ColorScheme = {
  brand: palette.emerald500,
  brandPressed: palette.emerald400,
  brandSoft: 'rgba(18,176,118,0.16)',
  brandSofter: 'rgba(18,176,118,0.09)',
  onBrand: palette.emerald950,
  deep: '#061B16',
  deepAlt: '#03110E',
  onDeep: palette.white,
  onDeepMuted: 'rgba(255,255,255,0.6)',
  accent: palette.emerald300,

  background: '#071411',
  surface: '#0E211C',
  surfaceAlt: '#152B24',
  surfaceSunken: '#0A1A16',
  surfaceInverse: palette.white,
  overlay: 'rgba(0,0,0,0.6)',
  scrim: 'rgba(255,255,255,0.06)',
  glass: 'rgba(14,33,28,0.8)',
  glassBorder: 'rgba(255,255,255,0.08)',

  border: '#1E352D',
  borderStrong: '#2C4A40',
  divider: '#172C25',

  text: '#EAF3F0',
  textSecondary: '#9DB2AB',
  textTertiary: '#6B837C',
  textInverse: palette.neutral900,
  textOnColor: palette.white,

  success: palette.emerald400,
  successSoft: 'rgba(34,197,139,0.15)',
  successText: palette.emerald300,
  warning: palette.amber500,
  warningSoft: 'rgba(245,158,11,0.16)',
  warningText: '#FCD34D',
  danger: '#FF6369',
  dangerSoft: 'rgba(229,72,77,0.16)',
  dangerText: '#FF9CA0',
  info: palette.blue500,
  infoSoft: 'rgba(46,125,247,0.16)',
  infoText: '#8FB9FF',
  neutralSoft: '#152B24',
  neutralText: '#9DB2AB',

  mapWater: '#0F2A3D',
  mapLand: '#101E1A',
  skeleton: '#172C25',
  skeletonHighlight: '#20382F',
};

export { palette };
