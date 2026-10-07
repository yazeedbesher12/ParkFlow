import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingStepper, AppButton, AppHeader, AppText, Reveal, Screen, TextField } from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { usePhoneAuthStore } from '@/store/phoneAuthStore';

export default function NameScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const storedName = usePhoneAuthStore((s) => s.fullName);
  const setName = usePhoneAuthStore((s) => s.setName);
  const [fullName, setFullName] = useState(storedName);
  const [touched, setTouched] = useState(false);
  const valid = fullName.trim().length >= 2 && fullName.trim().length <= 60;
  const next = () => {
    if (!valid) return;
    setName(fullName.trim());
    router.push('/(onboarding)/phone');
  };
  return (
    <Screen keyboardAvoiding>
      <AppHeader />
      <OnboardingStepper current={0} />
      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.nameTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">{t('onboarding.nameBeforePhone')}</AppText>
      </Reveal>
      <View style={{ marginTop: spacing.xxxl }}>
        <TextField label={t('onboarding.nameLabel')} emphasis="strong" value={fullName}
          onChangeText={setFullName} onBlur={() => setTouched(true)} autoCapitalize="words"
          autoComplete="name" textContentType="name" autoFocus maxLength={60} returnKeyType="next"
          onSubmitEditing={next} error={touched && !valid ? t('onboarding.nameInvalid') : undefined}
          testID="name-input" />
      </View>
      <View style={{ flex: 1, minHeight: spacing.xl }} />
      <AppButton label={t('common.continue')} disabled={!valid} onPress={next} testID="name-continue" />
    </Screen>
  );
}
