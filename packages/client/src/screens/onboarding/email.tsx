import { clientApplication } from '../../runtime/application';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { AppButton, AppHeader, AppText, InlineNotice, OnboardingStepper, Reveal, Screen, TextField } from '../../components/ui/index';
import { spacing } from '@parkflow/design/spacing';
import { useLocale } from '../../hooks/useLocale';
import { useDeadline } from '../../hooks/useDeadline';
import { services } from '../../services/index';
import type { AuthConfig } from '@parkflow/contracts/services';
import { usePhoneAuthStore } from '../../store/phoneAuthStore';
import { useEmailAuthStore } from '../../store/emailAuthStore';
import { useAuthStore } from '../../store/authStore';
import { authLanding, retryDelaySeconds, verificationRetryDelay } from '../../utils/authFlow';
import { errorMessage } from '../../utils/errors';
import { haptics } from '../../utils/haptics';

type Submission = { email: string; purpose: 'register' | 'login'; fullName?: string; entry: number };

export default function EmailScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((state) => state.user);
  const intent = usePhoneAuthStore();
  const emailState = useEmailAuthStore();
  const purpose = clientApplication === 'management' ? 'login' : intent.purpose;
  const [touched, setTouched] = useState(false);
  const [config, setConfig] = useState<AuthConfig>();
  const [configFailed, setConfigFailed] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [developmentRetryAt, setDevelopmentRetryAt] = useState(0);
  const entry = useRef(0);
  const active = useRef(false);
  const inFlight = useRef(false);
  useFocusEffect(useCallback(() => {
    active.current = true;
    const currentEntry = ++entry.current;
    setConfig(undefined);
    setConfigFailed(false);
    void services.auth.getConfig().then((nextConfig) => {
      if (active.current && currentEntry === entry.current) setConfig(nextConfig);
    }).catch(() => {
      if (active.current && currentEntry === entry.current) setConfigFailed(true);
    });
    return () => { active.current = false; ++entry.current; setConfig(undefined); };
  }, [configAttempt]));
  const current = (submission: Submission) => active.current && submission.entry === entry.current;
  const email = emailState.emailInput.trim().toLowerCase();
  const emailValid = z.email().max(254).safeParse(email).success;
  const development = config?.developmentEmailLoginEnabled === true;
  const waitSeconds = useDeadline(development ? developmentRetryAt : Math.max(emailState.retryAvailableAt, emailState.verificationAvailableAt));
  const request = useMutation({
    mutationFn: ({ entry: _entry, ...body }: Submission) => services.auth.requestOtp(body),
    onSuccess: (challenge, submission) => {
      if (!current(submission)) return;
      emailState.setChallenge(challenge, submission.purpose, submission.fullName ?? '');
      haptics.success();
      router.push('/(onboarding)/otp');
    },
    onError: (error, submission) => {
      if (!current(submission)) return;
      const delay = retryDelaySeconds(error);
      if (delay) emailState.setRetryDelay(delay);
      const lockDelay = verificationRetryDelay(error, 'send');
      if (lockDelay) emailState.setVerificationDelay(lockDelay);
      haptics.error();
    },
    onSettled: () => { inFlight.current = false; },
  });
  const login = useMutation({
    mutationFn: ({ entry: _entry, ...body }: Submission) => services.auth.devLogin(body),
    onSuccess: ({ user }, submission) => {
      if (!current(submission)) return;
      emailState.clearChallenge();
      intent.clearChallenge();
      haptics.success();
      router.replace(authLanding(user, clientApplication));
    },
    onError: (error, submission) => {
      if (!current(submission)) return;
      const delay = retryDelaySeconds(error);
      if (delay) setDevelopmentRetryAt(Date.now() + delay * 1000);
      haptics.error();
    },
    onSettled: () => { inFlight.current = false; },
  });
  if (user) return <Redirect href={authLanding(user, clientApplication)} />;
  if (config?.loginMethod === 'phone') return <Redirect href="/(onboarding)/phone" />;
  if (config && purpose === 'register' && !intent.fullName) return <Redirect href="/(onboarding)/name" />;
  const configReady = config?.loginMethod === 'email' && !configFailed;
  const pending = request.isPending || login.isPending;
  const activeRequest = development ? login : request;
  const submit = () => {
    if (!emailValid || !configReady || waitSeconds || pending || inFlight.current || !active.current) return;
    inFlight.current = true;
    const submission: Submission = { email, purpose, ...(purpose === 'register' ? { fullName: intent.fullName.trim() } : {}), entry: entry.current };
    if (development) login.mutate(submission);
    else request.mutate(submission);
  };
  return (
    <Screen keyboardAvoiding>
      <AppHeader />
      <OnboardingStepper current={purpose === 'register' ? 1 : 0} steps={purpose === 'register' ? undefined : ['email', 'verify']} />
      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t(purpose === 'register' ? 'onboarding.emailTitle' : 'onboarding.emailLoginTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">{t(configReady ? development ? 'onboarding.devEmailSubtitle' : 'onboarding.emailSubtitle' : 'common.loading')}</AppText>
      </Reveal>
      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        <TextField label={t('onboarding.emailLabel')} emphasis="strong" value={emailState.emailInput}
          onChangeText={(value) => { emailState.setEmailInput(value); request.reset(); login.reset(); }} onBlur={() => setTouched(true)}
          placeholder="you@example.com" keyboardType="email-address" textContentType="emailAddress"
          autoComplete="email" autoCapitalize="none" autoCorrect={false} autoFocus maxLength={254} returnKeyType="done"
          editable={!pending} onSubmitEditing={submit}
          error={touched && !emailValid ? t('onboarding.emailInvalid') : undefined} testID="email-input" />
        {configReady && development ? <InlineNotice tone="warning" title={t('onboarding.devLoginTitle')} body={t('onboarding.devEmailLoginBody')} /> : null}
        {configFailed ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={t('onboarding.authConfigFailed')}
          action={{ label: t('common.retry'), onPress: () => setConfigAttempt((attempt) => attempt + 1) }} /> : null}
        {activeRequest.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={development ? errorMessage(login.error) : t('onboarding.emailRequestFailed')} /> : null}
        {configReady && waitSeconds > 0 ? <InlineNotice tone="warning" title={t('onboarding.otpWait')} body={t('onboarding.otpRetryIn', { seconds: waitSeconds })} /> : null}
      </View>
      <View style={{ flex: 1, minHeight: spacing.xl }} />
      <View style={{ gap: spacing.lg }}>
        <AppText variant="caption" color="textTertiary" align="center">{t('onboarding.terms')}</AppText>
        <AppButton label={t(configReady && !development ? 'onboarding.sendCode' : 'common.continue')} disabled={!emailValid || !configReady || waitSeconds > 0 || pending}
          loading={pending || (!configReady && !configFailed)} onPress={submit} testID="email-continue" />
      </View>
    </Screen>
  );
}
