import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import type { AuthResult } from '@parkflow/contracts/services';
import { AppButton, AppHeader, AppText, InlineNotice, OnboardingStepper, OtpInput, PressableScale, Reveal, Screen } from '../../components/ui/index';
import { spacing } from '@parkflow/design/spacing';
import { useLocale } from '../../hooks/useLocale';
import { useDeadline } from '../../hooks/useDeadline';
import { services } from '../../services/index';
import { useEmailAuthStore } from '../../store/emailAuthStore';
import { usePhoneAuthStore } from '../../store/phoneAuthStore';
import { useAuthStore } from '../../store/authStore';
import { asciiDigits, authLanding, retryDelaySeconds, verificationRetryDelay } from '../../utils/authFlow';
import { clientApplication } from '../../runtime/application';
import { haptics } from '../../utils/haptics';

type Verification = { challengeId: string; code: string; entry: number };
type Resend = { email: string; purpose: 'register' | 'login'; fullName?: string; challengeId: string; entry: number };
const serverCode = (error: unknown) => (error as { details?: { serverCode?: unknown } } | null)?.details?.serverCode;

export default function EmailOtpScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((state) => state.user);
  const state = useEmailAuthStore();
  const challenge = state.challenge;
  const resendSeconds = useDeadline(Math.max(state.resendAvailableAt, state.retryAvailableAt));
  const lockSeconds = useDeadline(state.verificationAvailableAt);
  const expirySeconds = useDeadline(challenge ? Date.parse(challenge.expiresAt) : 0);
  const [code, setCode] = useState('');
  const entry = useRef(0);
  const active = useRef(false);
  const inFlight = useRef(false);
  const submittedFor = useRef<string | null>(null);
  useFocusEffect(useCallback(() => {
    active.current = true;
    ++entry.current;
    return () => { active.current = false; ++entry.current; };
  }, []));
  const current = (request: { entry: number; challengeId: string }) => active.current
    && request.entry === entry.current
    && request.challengeId === useEmailAuthStore.getState().challenge?.challengeId;
  const verify = useMutation<AuthResult, unknown, Verification>({
    mutationFn: async (submission) => {
      const result = await services.auth.verifyOtp({ challengeId: submission.challengeId, code: submission.code }, {
        shouldApply: () => current(submission) && !useAuthStore.getState().user,
      });
      const authenticated = useAuthStore.getState();
      const emailState = useEmailAuthStore.getState();
      // Publishing auth may already have unmounted this screen. Finish cleanup
      // in the operation itself while preserving any newer login or challenge.
      if (authenticated.user?.id === result.user.id
        && authenticated.session === result.session
        && emailState.challenge?.challengeId === submission.challengeId) {
        emailState.clearChallenge();
        usePhoneAuthStore.getState().clearChallenge();
      }
      return result;
    },
    onSuccess: ({ user }, submission) => {
      if (!active.current || submission.entry !== entry.current || useAuthStore.getState().user?.id !== user.id) return;
      haptics.success();
      router.replace(authLanding(user, clientApplication));
    },
    onError: (error, submission) => {
      if (!current(submission)) return;
      const delay = verificationRetryDelay(error, 'verify');
      if (delay) state.setVerificationDelay(delay);
      if (serverCode(error) === 'OTP_EXPIRED') state.expireChallenge();
      setCode('');
      submittedFor.current = null;
      haptics.error();
    },
    onSettled: () => { inFlight.current = false; },
  });
  const resend = useMutation({
    mutationFn: ({ challengeId: _challengeId, entry: _entry, ...body }: Resend) => services.auth.requestOtp(body),
    onSuccess: (next, submission) => {
      if (!current(submission)) return;
      state.setChallenge(next, submission.purpose, submission.fullName ?? '');
      setCode('');
      submittedFor.current = null;
      verify.reset();
      haptics.light();
    },
    onError: (error, submission) => {
      if (!current(submission)) return;
      const delay = retryDelaySeconds(error);
      if (delay) state.setRetryDelay(delay);
      const lockDelay = verificationRetryDelay(error, 'send');
      if (lockDelay) state.setVerificationDelay(lockDelay);
      haptics.error();
    },
    onSettled: () => { inFlight.current = false; },
  });
  if (!challenge) return <Redirect href={user ? authLanding(user, clientApplication) : '/(onboarding)/email'} />;
  const expired = expirySeconds <= 0 || !Number.isFinite(expirySeconds);
  const pending = verify.isPending || resend.isPending;
  const blocked = pending || lockSeconds > 0 || expired;
  const submit = (value: string) => {
    const digits = asciiDigits(value);
    if (!/^\d{6}$/.test(digits) || blocked || inFlight.current || submittedFor.current === digits || !active.current) return;
    inFlight.current = true;
    submittedFor.current = digits;
    verify.mutate({ challengeId: challenge.challengeId, code: digits, entry: entry.current });
  };
  const sendAgain = () => {
    if (pending || inFlight.current || resendSeconds > 0 || lockSeconds > 0 || !active.current) return;
    inFlight.current = true;
    resend.mutate({ email: challenge.email, purpose: state.purpose, ...(state.purpose === 'register' ? { fullName: state.fullName } : {}), challengeId: challenge.challengeId, entry: entry.current });
  };
  const waitSeconds = Math.max(resendSeconds, lockSeconds);
  const verifyCode = serverCode(verify.error);
  const verifyTitle = t(verifyCode === 'EMAIL_MIGRATION_REQUIRED' ? 'onboarding.emailAccountLinkRequiredTitle'
    : verifyCode === 'EMAIL_ACCOUNT_NOT_FOUND' ? 'onboarding.emailAccountNotFoundTitle'
    : 'onboarding.otpVerifyFailed');
  const verifyBody = t(verifyCode === 'OTP_LOCKED' ? 'onboarding.otpEmailLocked'
    : verifyCode === 'OTP_EXPIRED' ? 'onboarding.otpEmailExpired'
    : verifyCode === 'EMAIL_MIGRATION_REQUIRED' ? 'onboarding.emailAccountLinkRequired'
    : verifyCode === 'EMAIL_ACCOUNT_NOT_FOUND' ? 'onboarding.emailAccountNotFound'
    : verifyCode === 'OTP_INVALID' ? 'onboarding.otpEmailInvalidCode'
    : 'onboarding.emailVerifyFailed');
  return (
    <Screen keyboardAvoiding>
      <AppHeader />
      <OnboardingStepper current={state.purpose === 'register' ? 2 : 1} steps={state.purpose === 'register' ? undefined : ['email', 'verify']} />
      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.otpEmailTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">{t('onboarding.otpEmailSubtitle', { email: challenge.email })}</AppText>
      </Reveal>
      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        <OtpInput value={code} onChangeText={(value) => setCode(asciiDigits(value).replace(/\D/g, '').slice(0, 6))}
          length={6} hasError={verify.isError} disabled={blocked} onComplete={submit} testID="otp-input" />
        <AppText variant="bodySm" color="textSecondary">{t('onboarding.otpEmailSecurity')}</AppText>
        {expired ? <InlineNotice tone="warning" title={t('onboarding.otpExpired')} body={t('onboarding.otpEmailExpired')} /> : null}
        {verify.isError ? <InlineNotice tone="danger" title={verifyTitle} body={verifyBody} /> : null}
        {resend.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={t('onboarding.emailRequestFailed')} /> : null}
        {lockSeconds > 0 ? <InlineNotice tone="warning" title={t('onboarding.otpWait')} body={t('onboarding.otpRetryIn', { seconds: lockSeconds })} /> : null}
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          {waitSeconds > 0 ? <AppText variant="bodySm" color="textTertiary" numeric>{t('onboarding.otpResendIn', { seconds: waitSeconds })}</AppText> : (
            <PressableScale disabled={pending} onPress={sendAgain} haptic="light" hitSlop={10} testID="otp-resend">
              <AppText variant="label" color="brand">{resend.isPending ? t('common.loading') : t('onboarding.otpResend')}</AppText>
            </PressableScale>
          )}
          <PressableScale disabled={pending} onPress={() => {
            if (inFlight.current) return;
            state.clearChallenge();
            router.replace('/(onboarding)/email');
          }} haptic="light" hitSlop={10} testID="otp-change-email">
            <AppText variant="bodySm" color="textSecondary">{t('onboarding.otpChangeEmail')}</AppText>
          </PressableScale>
        </View>
      </View>
      <View style={{ flex: 1, minHeight: spacing.xl }} />
      <AppButton label={t('common.continue')} disabled={code.length !== 6 || blocked} loading={verify.isPending}
        onPress={() => submit(code)} testID="otp-continue" />
    </Screen>
  );
}
