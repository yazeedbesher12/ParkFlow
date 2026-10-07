import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { OnboardingStepper, AppButton, AppHeader, AppText, InlineNotice, OtpInput, PressableScale, Reveal, Screen } from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useDeadline } from '@/hooks/useDeadline';
import { services } from '@/services';
import { usePhoneAuthStore } from '@/store/phoneAuthStore';
import { useAuthStore } from '@/store/authStore';
import { authLanding, retryDelaySeconds, verificationRetryDelay } from '@/utils/authFlow';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function OtpScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((state) => state.user);
  const { challenge, purpose, fullName, setChallenge, resendAvailableAt, retryAvailableAt, verificationAvailableAt, setRetryDelay, setVerificationDelay, clearChallenge } = usePhoneAuthStore();
  const resendSeconds = useDeadline(Math.max(resendAvailableAt, retryAvailableAt));
  const lockSeconds = useDeadline(verificationAvailableAt);
  const expirySeconds = useDeadline(challenge ? Date.parse(challenge.expiresAt) : 0);
  const [code, setCode] = useState('');
  const submittedFor = useRef<string | null>(null);
  const verifying = useRef(false);
  const verify = useMutation({
    mutationFn: (value: string) => services.auth.verifyPhoneOtp({ challengeId: challenge!.challengeId, code: value }),
    onSuccess: ({ user }) => {
      clearChallenge();
      haptics.success();
      router.replace(authLanding(user));
    },
    onError: (error) => {
      const delay = verificationRetryDelay(error, 'verify');
      if (delay) setVerificationDelay(delay);
      setCode('');
      submittedFor.current = null;
      haptics.error();
    },
    onSettled: () => { verifying.current = false; },
  });
  const resend = useMutation({
    mutationFn: () => services.auth.requestPhoneOtp({ phone: challenge!.phone, purpose, ...(purpose === 'register' ? { fullName } : {}) }),
    onSuccess: (next) => {
      setChallenge(next);
      setCode('');
      submittedFor.current = null;
      verify.reset();
      haptics.light();
    },
    onError: (error) => {
      const delay = retryDelaySeconds(error);
      if (delay) setRetryDelay(delay);
      const verificationDelay = verificationRetryDelay(error, 'send');
      if (verificationDelay) setVerificationDelay(verificationDelay);
    },
  });
  if (!challenge) return <Redirect href={user ? authLanding(user) : '/(onboarding)/phone'} />;
  const blocked = verify.isPending || resend.isPending || lockSeconds > 0 || expirySeconds === 0;
  const submit = (value: string) => {
    if (!/^\d{6}$/.test(value) || blocked || verifying.current || submittedFor.current === value) return;
    verifying.current = true;
    submittedFor.current = value;
    verify.mutate(value);
  };
  const waitSeconds = Math.max(resendSeconds, lockSeconds);
  return (
    <Screen keyboardAvoiding>
      <AppHeader />
      {purpose === 'register' ? <OnboardingStepper current={2} /> : null}
      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.otpPhoneTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">{t(challenge.delivery === 'sms' ? 'onboarding.otpPhoneSubtitle' : 'onboarding.otpDevSubtitle', { phone: challenge.phone })}</AppText>
      </Reveal>
      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        {challenge.delivery === 'development' ? <InlineNotice tone="warning" title={t('onboarding.devDeliveryTitle')} body={t('onboarding.devDeliveryBody')} /> : null}
        <OtpInput value={code} onChangeText={setCode} length={6} hasError={verify.isError} disabled={blocked} onComplete={submit} testID="otp-input" />
        <AppText variant="bodySm" color="textSecondary">{t('onboarding.otpSecurity')}</AppText>
        {expirySeconds === 0 ? <InlineNotice tone="warning" title={t('onboarding.otpExpired')} body={t('onboarding.otpExpiredBody')} /> : null}
        {verify.isError ? <InlineNotice tone="danger" title={t('onboarding.otpVerifyFailed')} body={errorMessage(verify.error)} /> : null}
        {resend.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(resend.error)} /> : null}
        {lockSeconds > 0 ? <InlineNotice tone="warning" title={t('onboarding.otpWait')} body={t('onboarding.otpRetryIn', { seconds: lockSeconds })} /> : null}
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          {waitSeconds > 0 ? <AppText variant="bodySm" color="textTertiary" numeric>{t('onboarding.otpResendIn', { seconds: waitSeconds })}</AppText> : (
            <PressableScale disabled={resend.isPending || verify.isPending} onPress={() => resend.mutate()} haptic="light" hitSlop={10}>
              <AppText variant="label" color="brand">{resend.isPending ? t('common.loading') : t('onboarding.otpResend')}</AppText>
            </PressableScale>
          )}
          <PressableScale disabled={verify.isPending || resend.isPending} onPress={() => router.replace('/(onboarding)/phone')} haptic="light" hitSlop={10}>
            <AppText variant="bodySm" color="textSecondary">{t('onboarding.otpChangePhone')}</AppText>
          </PressableScale>
        </View>
      </View>
      <View style={{ flex: 1, minHeight: spacing.xl }} />
      <AppButton label={t('common.continue')} disabled={code.length !== 6 || blocked} loading={verify.isPending} onPress={() => submit(code)} testID="otp-continue" />
    </Screen>
  );
}
