import { useCallback, useMemo } from 'react';
import { I18nManager, Platform } from 'react-native';
import {
  intlLocale,
  isRtlLocale,
  translate,
  type Locale,
  type TranslationKey,
} from '@/i18n';
import { usePreferencesStore } from '@/store/preferencesStore';

export interface LocaleContext {
  locale: Locale;
  isRTL: boolean;
  /** Locale string for Intl date/number formatting. */
  dateLocale: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  /** Flip a row when the language is RTL. */
  row: 'row' | 'row-reverse';
  textAlign: 'left' | 'right';
  /** Direction multiplier for translateX-style animations and chevrons. */
  dir: 1 | -1;
}

/**
 * Layout direction is driven from React state rather than `I18nManager.forceRTL`
 * because forcing RTL natively requires a full app restart. Components consume
 * `row` / `textAlign` / `dir` so Arabic mirrors correctly the moment it is
 * selected — and we still tell I18nManager to allow RTL so native text input and
 * system components behave.
 */
export function useLocale(): LocaleContext {
  const locale = usePreferencesStore((s) => s.locale);
  const setStoredLocale = usePreferencesStore((s) => s.setLocale);

  const isRTL = isRtlLocale(locale);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  );

  const setLocale = useCallback(
    (next: Locale) => {
      setStoredLocale(next);
      if (Platform.OS !== 'web') {
        I18nManager.allowRTL(isRtlLocale(next));
      } else if (typeof document !== 'undefined') {
        document.documentElement.dir = isRtlLocale(next) ? 'rtl' : 'ltr';
        document.documentElement.lang = next;
      }
    },
    [setStoredLocale],
  );

  return useMemo(
    () => ({
      locale,
      isRTL,
      dateLocale: intlLocale(locale),
      t,
      setLocale,
      row: isRTL ? 'row-reverse' : 'row',
      textAlign: isRTL ? 'right' : 'left',
      dir: isRTL ? -1 : 1,
    }),
    [locale, isRTL, t, setLocale],
  );
}
