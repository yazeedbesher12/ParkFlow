import { View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { AppButton, AppText, Card, Screen } from '@parkflow/client/components/ui';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { usePhoneAuthStore } from '@parkflow/client/store/phoneAuthStore';
import { useEmailAuthStore } from '@parkflow/client/store/emailAuthStore';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { authLanding } from '@parkflow/client/utils/authFlow';
import { spacing } from '@parkflow/design/spacing';

export default function ManagementWelcome() {
  const router = useRouter();
  const { locale } = useLocale();
  const { colors } = useTheme();
  const user = useAuthStore(state => state.user);
  const begin = usePhoneAuthStore(state => state.begin);
  const text = (en: string, ar: string) => locale === 'ar' ? ar : en;

  if (user) return <Redirect href={authLanding(user, 'management')} />;

  return <Screen contentContainerStyle={{ justifyContent: 'center', alignItems: 'center' }}>
    <Card padding="xl" style={{ width: '100%', maxWidth: 560, gap: spacing.xxl }}>
      <View style={{ gap: spacing.lg }}>
        <ShieldCheck size={40} color={colors.brand} />
        <AppText variant="h1">{text('Your parking workspace', 'مساحة إدارة مواقفك')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">
          {text('Sign in to manage parking locations, teams and day-to-day operations.', 'سجّل الدخول لإدارة المواقف والفِرق والعمليات اليومية.')}
        </AppText>
      </View>
      <AppButton
        label={text('Staff sign in', 'دخول الموظفين')}
        onPress={() => { useEmailAuthStore.getState().reset(); begin('login'); router.push('/(onboarding)/email'); }}
        testID="management-sign-in"
      />
      <AppText variant="bodySm" color="textSecondary">
        {text('Use your assigned administrator or parking operator account. Ask your organization administrator if you need access.', 'استخدم حساب المسؤول أو مشغّل المواقف المعيّن لك. تواصل مع مسؤول مؤسستك إذا كنت بحاجة إلى صلاحية الدخول.')}
      </AppText>
    </Card>
  </Screen>;
}
