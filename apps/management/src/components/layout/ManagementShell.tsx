import { useState, type ReactNode } from 'react';
import { Platform, View, useWindowDimensions, type DimensionValue } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AppButton, AppText, InlineNotice } from '@parkflow/client/components/ui';
import { LogoMark } from '@parkflow/client/components/brand/Logo';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { services } from '@parkflow/client/services';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { errorMessage } from '@parkflow/client/utils/errors';
import { spacing } from '@parkflow/design/spacing';

const administratorLinks = [
  { path: '/admin', en: 'Admin dashboard', ar: 'لوحة الإدارة' },
  { path: '/admin/manage', en: 'Parking & organizations', ar: 'المواقف والمؤسسات' },
  { path: '/admin/appearance', en: 'Appearance & content', ar: 'المظهر والمحتوى' },
  { path: '/admin/vehicles', en: 'Vehicle verification', ar: 'توثيق المركبات' },
] as const;

const operatorLinks = [
  { path: '/operator', en: 'Operator workspace', ar: 'مساحة المشغّل' },
  { path: '/operator/manage', en: 'My parking & staff', ar: 'مواقفي والموظفون' },
  { path: '/operator/analytics', en: 'Analytics', ar: 'التحليلات' },
] as const;

/** Revoke this frontend's session and discard its own query cache. */
export function useManagementSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string>();

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(undefined);
    try {
      await services.auth.signOut();
    } catch (cause) {
      // The HTTP service clears local auth even when revocation is unreachable.
      if (useAuthStore.getState().user) {
        setError(errorMessage(cause));
        return;
      }
    } finally {
      queryClient.clear();
      setSigningOut(false);
    }
    router.replace('/(onboarding)/welcome');
  }

  return { signOut, signingOut, error };
}

/** Portal chrome stays outside each screen's existing scroll container. */
export function ManagementShell({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { locale, row, isRTL, setLocale } = useLocale();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const { signOut, signingOut, error } = useManagementSignOut();
  const [menuOpen, setMenuOpen] = useState(false);
  const compact = width < 900;
  const isAdmin = user?.role === 'ADMIN';
  const hasAccess = isAdmin || user?.role === 'PARKING_OPERATOR';
  const text = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const links = isAdmin ? [...administratorLinks, ...operatorLinks] : [...operatorLinks];
  const active = (path: string) => pathname === path
    || (path === '/operator' && pathname.startsWith('/operator/zones/'));

  return (
    <View style={{
      flex: 1,
      width: '100%',
      height: Platform.OS === 'web' ? '100dvh' as DimensionValue : '100%',
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      overflow: 'hidden',
    }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 1280, minWidth: 0, backgroundColor: colors.background }}>
        <View style={{ padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: row, flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, minWidth: 180, flexDirection: row, alignItems: 'center', gap: spacing.md }}>
              <LogoMark size={40} usePublishedBrand={false} />
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <AppText variant="title">{text('ParkFlow management', 'إدارة ParkFlow')}</AppText>
                <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                  {hasAccess ? user?.fullName || text('Staff workspace', 'مساحة الموظفين') : text('Staff portal', 'بوابة الموظفين')}
                </AppText>
              </View>
            </View>
            <View style={{ maxWidth: '100%', flexDirection: row, flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
              <AppButton
                label={isRTL ? 'English' : 'العربية'}
                accessibilityHint={text('Switch the portal language to Arabic.', 'تغيير لغة البوابة إلى الإنجليزية.')}
                variant="ghost" size="sm" fullWidth={false}
                onPress={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
              />
              {hasAccess && compact ? <AppButton
                label={menuOpen ? text('Close menu', 'إغلاق القائمة') : text('Menu', 'القائمة')}
                variant="secondary" size="sm" fullWidth={false}
                onPress={() => setMenuOpen(open => !open)}
              /> : null}
              {hasAccess ? <AppButton
                label={text('Sign out', 'تسجيل الخروج')} variant="ghost" size="sm" fullWidth={false}
                loading={signingOut} onPress={() => { void signOut(); }}
              /> : null}
            </View>
          </View>
          {hasAccess && (!compact || menuOpen) ? <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
            {links.map(link => <AppButton
              key={link.path} label={text(link.en, link.ar)}
              variant={active(link.path) ? 'secondary' : 'ghost'} size="sm" fullWidth={false}
              disabled={signingOut}
              onPress={() => { setMenuOpen(false); router.push(link.path); }}
              testID={`management-nav-${link.path.slice(1).replaceAll('/', '-')}`}
            />)}
          </View> : null}
          {error ? <InlineNotice tone="danger" title={text('Could not sign out', 'تعذر تسجيل الخروج')} body={error} /> : null}
        </View>
        <View style={{ flex: 1, minHeight: 0, minWidth: 0 }}>{children}</View>
      </View>
    </View>
  );
}
