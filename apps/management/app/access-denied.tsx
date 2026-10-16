import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { AppButton, AppText, Card, InlineNotice, Screen } from '@parkflow/client/components/ui';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { authLanding } from '@parkflow/client/utils/authFlow';
import { spacing } from '@parkflow/design/spacing';
import { useManagementSignOut } from '@/components/layout/ManagementShell';

export default function ManagementAccessDenied() {
  const { locale } = useLocale();
  const { colors } = useTheme();
  const user = useAuthStore(state => state.user);
  const { signOut, signingOut, error } = useManagementSignOut();
  const text = (en: string, ar: string) => locale === 'ar' ? ar : en;

  if (!user || user.role === 'ADMIN' || user.role === 'PARKING_OPERATOR') {
    return <Redirect href={authLanding(user, 'management')} />;
  }

  return <Screen contentContainerStyle={{ justifyContent: 'center', alignItems: 'center' }}>
    <Card padding="xl" style={{ width: '100%', maxWidth: 560, gap: spacing.xxl }}>
      <View style={{ gap: spacing.lg }}>
        <ShieldAlert size={40} color={colors.warning} />
        <AppText variant="h1">{text('Management access required', 'يلزم وصول الإدارة')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">
          {text('This account has no access to the staff portal. Sign in with an assigned administrator or parking operator account.', 'لا يملك هذا الحساب صلاحية الدخول إلى بوابة الموظفين. سجّل الدخول بحساب مسؤول أو مشغّل مواقف معيّن.')}
        </AppText>
        {user.fullName ? <AppText color="textSecondary">{text('Signed in as ', 'تم الدخول باسم ')}{user.fullName}</AppText> : null}
      </View>
      <AppButton
        label={text('Sign out and use another account', 'الخروج واستخدام حساب آخر')}
        loading={signingOut} onPress={() => { void signOut(); }}
        testID="management-denied-sign-out"
      />
      {error ? <InlineNotice tone="danger" title={text('Could not sign out', 'تعذر تسجيل الخروج')} body={error} /> : null}
      <AppText variant="bodySm" color="textSecondary">
        {text('Contact your organization administrator to request staff access.', 'تواصل مع مسؤول مؤسستك لطلب صلاحية الموظفين.')}
      </AppText>
    </Card>
  </Screen>;
}
