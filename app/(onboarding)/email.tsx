import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import {
  AppButton,
  AppHeader,
  AppText,
  InlineNotice,
  Reveal,
  Screen,
  TextField,
} from '@/components/ui';
import { z } from 'zod';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { services } from '@/services';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function EmailScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const normalized = email.trim().toLowerCase();
  const isValid = z.email().max(254).safeParse(normalized).success;
  const showError = touched && normalized.length > 0 && !isValid;

  const requestOtp = useMutation({
    mutationFn: () => services.auth.requestOtp({ email: normalized }),
    onSuccess: (challenge) => {
      haptics.success();
      router.push({
        pathname: '/(onboarding)/otp',
        params: {
          challengeId: challenge.challengeId,
          email: challenge.email,
          resendAfter: String(challenge.resendAfterSeconds),
        },
      });
    },
    onError: () => haptics.error(),
  });

  return (
    <Screen keyboardAvoiding safeBottom>
      <AppHeader />

      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.emailTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">
          {t('onboarding.emailSubtitle')}
        </AppText>
      </Reveal>

      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        <TextField
          label={t('onboarding.emailLabel')}
          emphasis="strong"
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched(true)}
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={254}
          error={showError ? t('onboarding.emailInvalid') : undefined}
          testID="email-input"
        />

        {requestOtp.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(requestOtp.error)}
          />
        ) : null}
      </View>

      <View style={{ flex: 1, minHeight: spacing.xl }} />

      <View style={{ gap: spacing.lg }}>
        <AppText
          variant="caption"
          color="textTertiary"
          align="center"
          style={{ maxWidth: 340, alignSelf: 'center' }}
        >
          {t('onboarding.terms')}
        </AppText>
        <AppButton
          label={t('common.continue')}
          disabled={!isValid}
          loading={requestOtp.isPending}
          onPress={() => requestOtp.mutate()}
          testID="email-continue"
        />
      </View>

    </Screen>
  );
}
