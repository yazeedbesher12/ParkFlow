import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { AppButton, AppHeader, AppText, InlineNotice, Reveal, Screen, TextField } from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useDeadline } from '@/hooks/useDeadline';
import { services } from '@/services';
import type { AuthConfig } from '@/services/types';
import { usePhoneAuthStore } from '@/store/phoneAuthStore';
import { useAuthStore } from '@/store/authStore';
import { authLanding, retryDelaySeconds } from '@/utils/authFlow';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function EmailScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((state) => state.user);
  const { purpose, fullName, clearChallenge } = usePhoneAuthStore();
  const [emailInput, setEmailInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [config, setConfig] = useState<AuthConfig>();
  const [configFailed, setConfigFailed] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [developmentRetryAt, setDevelopmentRetryAt] = useState(0);
  // Refresh on every entry so stopping the server's email mode restores phone login.
  useFocusEffect(useCallback(() => {
    let active = true;
    setConfig(undefined);
    setConfigFailed(false);
    void services.auth.getConfig().then((nextConfig) => {
      if (active) setConfig(nextConfig);
    }).catch(() => { if (active) setConfigFailed(true); });
    return () => { active = false; setConfig(undefined); };
  }, [configAttempt]));
  const email = emailInput.trim().toLowerCase();
  const emailValid = z.email().max(254).safeParse(email).success;
  const waitSeconds = useDeadline(developmentRetryAt);
  const login = useMutation({
    mutationFn: () => services.auth.devLogin({ email, purpose, ...(purpose === 'register' ? { fullName } : {}) }),
    onSuccess: ({ user }) => {
      clearChallenge();
      haptics.success();
      router.replace(authLanding(user));
    },
    onError: (error) => {
      const delay = retryDelaySeconds(error);
      if (delay) setDevelopmentRetryAt(Date.now() + delay * 1000);
      haptics.error();
    },
  });
  if (user) return <Redirect href={authLanding(user)} />;
  if (config && !config.developmentEmailLoginEnabled) return <Redirect href="/(onboarding)/phone" />;
  if (config && purpose === 'register' && !fullName) return <Redirect href="/(onboarding)/name" />;
  const configReady = config?.developmentEmailLoginEnabled === true && !configFailed;
  const submit = () => {
    if (!emailValid || !configReady || waitSeconds || login.isPending) return;
    login.mutate();
  };
  return (
    <Screen keyboardAvoiding>
      <AppHeader />
      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t(purpose === 'register' ? 'onboarding.emailTitle' : 'onboarding.emailLoginTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">{t(configReady ? 'onboarding.devEmailSubtitle' : 'common.loading')}</AppText>
      </Reveal>
      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        <TextField label={t('onboarding.emailLabel')} emphasis="strong" value={emailInput}
          onChangeText={(value) => { setEmailInput(value); login.reset(); }} onBlur={() => setTouched(true)}
          placeholder="you@example.com" keyboardType="email-address" textContentType="emailAddress"
          autoComplete="email" autoCapitalize="none" autoCorrect={false} autoFocus maxLength={254} returnKeyType="done"
          editable={!login.isPending} onSubmitEditing={submit}
          error={touched && !emailValid ? t('onboarding.emailInvalid') : undefined} testID="email-input" />
        {configReady ? <InlineNotice tone="warning" title={t('onboarding.devLoginTitle')} body={t('onboarding.devEmailLoginBody')} /> : null}
        {configFailed ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={t('onboarding.authConfigFailed')}
          action={{ label: t('common.retry'), onPress: () => setConfigAttempt((attempt) => attempt + 1) }} /> : null}
        {login.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(login.error)} /> : null}
        {configReady && waitSeconds > 0 ? <InlineNotice tone="warning" title={t('onboarding.otpWait')} body={t('onboarding.otpRetryIn', { seconds: waitSeconds })} /> : null}
      </View>
      <View style={{ flex: 1, minHeight: spacing.xl }} />
      <View style={{ gap: spacing.lg }}>
        <AppText variant="caption" color="textTertiary" align="center">{t('onboarding.terms')}</AppText>
        <AppButton label={t('common.continue')} disabled={!emailValid || !configReady || waitSeconds > 0}
          loading={login.isPending || (!configReady && !configFailed)} onPress={submit} testID="email-continue" />
      </View>
    </Screen>
  );
}
