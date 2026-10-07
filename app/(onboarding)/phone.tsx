import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AppButton, AppHeader, AppText, InlineNotice, Reveal, Screen, TextField } from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useDeadline } from '@/hooks/useDeadline';
import { services } from '@/services';
import type { AuthConfig } from '@/services/types';
import { usePhoneAuthStore } from '@/store/phoneAuthStore';
import { useAuthStore } from '@/store/authStore';
import { authLanding, normalizePhoneInput, retryDelaySeconds } from '@/utils/authFlow';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function PhoneScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((state) => state.user);
  const { purpose, fullName, phoneInput, setPhoneInput, setChallenge, retryAvailableAt, setRetryDelay, clearChallenge } = usePhoneAuthStore();
  const [touched, setTouched] = useState(false);
  const [config, setConfig] = useState<AuthConfig>();
  const [configFailed, setConfigFailed] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [developmentRetryAt, setDevelopmentRetryAt] = useState(0);
  // Read on every screen entry; cached development settings must not choose an auth path.
  useFocusEffect(useCallback(() => {
    let active = true;
    setConfig(undefined);
    setConfigFailed(false);
    void services.auth.getConfig().then((config) => {
      if (active) setConfig(config);
    }).catch(() => { if (active) setConfigFailed(true); });
    return () => { active = false; setConfig(undefined); };
  }, [configAttempt]));
  const developmentLoginEnabled = config?.developmentLoginEnabled;
  const phone = normalizePhoneInput(phoneInput);
  const waitSeconds = useDeadline(developmentLoginEnabled ? developmentRetryAt : retryAvailableAt);
  const request = useMutation({
    mutationFn: () => services.auth.requestPhoneOtp({ phone: phone!, purpose, ...(purpose === 'register' ? { fullName } : {}) }),
    onSuccess: (challenge) => {
      setChallenge(challenge);
      haptics.success();
      router.push('/(onboarding)/otp');
    },
    onError: (error) => {
      const delay = retryDelaySeconds(error);
      if (delay) setRetryDelay(delay);
      haptics.error();
    },
  });
  const developmentLogin = useMutation({
    mutationFn: () => services.auth.devPhoneLogin({ phone: phone!, purpose, ...(purpose === 'register' ? { fullName } : {}) }),
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
  if (config?.developmentEmailLoginEnabled) return <Redirect href="/(onboarding)/email" />;
  if (config && purpose === 'register' && !fullName) return <Redirect href="/(onboarding)/name" />;
  const configReady = !!config && !configFailed;
  const pending = request.isPending || developmentLogin.isPending;
  const activeRequest = developmentLoginEnabled ? developmentLogin : request;
  const submit = () => {
    if (!phone || !configReady || waitSeconds || pending) return;
    if (developmentLoginEnabled) developmentLogin.mutate();
    else request.mutate();
  };
  return (
    <Screen keyboardAvoiding>
      <AppHeader />
      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t(purpose === 'register' ? 'onboarding.phoneTitle' : 'onboarding.phoneLoginTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">{t(developmentLoginEnabled ? 'onboarding.devPhoneSubtitle' : configReady ? 'onboarding.phoneSubtitle' : 'common.loading')}</AppText>
      </Reveal>
      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        <TextField label={t('profile.phone')} emphasis="strong" value={phoneInput}
          onChangeText={(value) => { setPhoneInput(value); request.reset(); developmentLogin.reset(); }} onBlur={() => setTouched(true)}
          placeholder="0599 123 456" keyboardType="phone-pad" textContentType="telephoneNumber"
          autoComplete="tel" autoCorrect={false} autoFocus maxLength={25} returnKeyType="done"
          editable={!pending}
          onSubmitEditing={submit} error={touched && !phone ? t('onboarding.phoneInvalid') : undefined}
          testID="phone-input" />
        <AppText variant="bodySm" color="textSecondary">{t('onboarding.phoneCountry')}</AppText>
        {developmentLoginEnabled ? <InlineNotice tone="warning" title={t('onboarding.devLoginTitle')} body={t('onboarding.devLoginBody')} /> : null}
        {configFailed ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={t('onboarding.authConfigFailed')}
          action={{ label: t('common.retry'), onPress: () => setConfigAttempt((attempt) => attempt + 1) }} /> : null}
        {activeRequest.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(activeRequest.error)} /> : null}
        {configReady && waitSeconds > 0 ? <InlineNotice tone="warning" title={t('onboarding.otpWait')} body={t('onboarding.otpRetryIn', { seconds: waitSeconds })} /> : null}
      </View>
      <View style={{ flex: 1, minHeight: spacing.xl }} />
      <View style={{ gap: spacing.lg }}>
        <AppText variant="caption" color="textTertiary" align="center">{t('onboarding.terms')}</AppText>
        <AppButton label={t(developmentLoginEnabled === false ? 'onboarding.sendCode' : 'common.continue')} disabled={!phone || !configReady || waitSeconds > 0}
          loading={pending || (!configReady && !configFailed)} onPress={submit} testID="phone-continue" />
      </View>
    </Screen>
  );
}
