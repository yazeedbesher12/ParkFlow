import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ColorScheme } from './colors';
import { usePreferencesStore, type ThemeMode } from '@/store/preferencesStore';
import { useAppConfigStore } from '@/store/appConfigStore';
import { configuredColors } from './appConfigColors';

interface ThemeContextValue {
  colors: ColorScheme;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children, previewBrandColor }: { children: ReactNode; previewBrandColor?: string }) {
  const systemScheme = useColorScheme();
  const mode = usePreferencesStore((s) => s.themeMode);
  const setMode = usePreferencesStore((s) => s.setThemeMode);
  const publishedBrandColor = useAppConfigStore((s) => s.config.brandColor);
  const brandColor = previewBrandColor ?? publishedBrandColor;

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: configuredColors(isDark ? darkColors : lightColors, brandColor), isDark, mode, setMode }),
    [isDark, mode, setMode, brandColor],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}

/** Shorthand for the common case of only needing colours. */
export const useColors = (): ColorScheme => useTheme().colors;
