import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { AppButton, AppText, InlineNotice, Reveal, Screen, TextField } from '../../components/ui/index';
import { spacing } from '@parkflow/design/spacing';
import { useLocale } from '../../hooks/useLocale';
import { useBlockHardwareBack } from '../../hooks/useBlockHardwareBack';
import { services } from '../../services/index';
import { useAuthStore } from '../../store/authStore';
import { usePhoneAuthStore } from '../../store/phoneAuthStore';
import { asciiDigits, authLanding } from '../../utils/authFlow';
import { clientApplication } from '../../runtime/application';
import { errorMessage } from '../../utils/errors';
import { haptics } from '../../utils/haptics';

export default function ProfileDetailsScreen() {
  useBlockHardwareBack();
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setVehicleSetup = usePhoneAuthStore((s) => s.setVehicleSetup);
  const needsName = !!user && !user.fullName.trim();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState(user?.email ?? '');
  const [nationalId, setNationalId] = useState('');
  const normalizedEmail = email.trim().toLowerCase();
  const emailAccount = !!user?.email && (!user.phone || !!user.emailVerifiedAt);
  const verifiedEmailAccount = emailAccount && !!user?.emailVerifiedAt;
  const normalizedName = fullName.trim();
  const nameValid = !needsName || (normalizedName.length >= 2 && normalizedName.length <= 60);
  const emailValid = !normalizedEmail || z.email().max(254).safeParse(normalizedEmail).success;
  const idValid = !nationalId || /^\d{9}$/.test(nationalId);
  const save = useMutation({
    mutationFn: () => services.auth.completePhoneProfile({ ...(normalizedEmail ? { email: normalizedEmail } : {}), ...(nationalId ? { nationalId } : {}), ...(needsName ? { fullName: normalizedName } : {}) }),
    onSuccess: (updated) => {
      setVehicleSetup(clientApplication === 'customer' ? updated.id : undefined);
      setNationalId('');
      setUser(updated);
      haptics.success();
      router.replace(clientApplication === 'customer' ? '/(onboarding)/vehicle' : authLanding(updated, clientApplication));
    },
    onError: () => haptics.error(),
  });
  const submit = () => {
    if (!user || !emailValid || !idValid || !nameValid || save.isPending) return;
    save.mutate();
  };
  return (
    <Screen keyboardAvoiding>
      <View style={{ height: spacing.giant }} />
      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.detailsTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">{t(verifiedEmailAccount ? 'onboarding.detailsEmailSubtitle' : emailAccount ? 'onboarding.detailsDevelopmentEmailSubtitle' : user?.phoneVerifiedAt ? 'onboarding.detailsSubtitle' : 'onboarding.detailsDevelopmentSubtitle')}</AppText>
      </Reveal>
      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        {needsName ? <TextField label={t('onboarding.nameLabel')} value={fullName} onChangeText={setFullName}
          onBlur={() => setNameTouched(true)} autoCapitalize="words" autoComplete="name" textContentType="name"
          autoFocus maxLength={60} returnKeyType="done" editable={!save.isPending} onSubmitEditing={submit}
          error={nameTouched && !nameValid ? t('onboarding.nameInvalid') : undefined} testID="profile-name" /> : null}
        <TextField label={emailAccount ? t('profile.email') : `${t('profile.email')} (${t('common.optional')})`}
          value={email} onChangeText={setEmail} editable={!emailAccount}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
          placeholder="you@example.com" maxLength={254} error={!emailValid ? t('onboarding.emailInvalid') : undefined} testID="profile-email" />
        <TextField label={`${t('profile.nationalId')} (${t('common.optional')})`} value={nationalId}
          onChangeText={(value) => setNationalId(asciiDigits(value).replace(/\D/g, ''))} keyboardType="number-pad"
          maxLength={9} autoComplete="off" autoCorrect={false} error={!idValid ? t('profile.nationalIdInvalid') : undefined} testID="profile-national-id" />
        <AppText variant="bodySm" color="textSecondary">{t(verifiedEmailAccount ? 'onboarding.detailsEmailPrivacy' : emailAccount ? 'onboarding.detailsDevelopmentEmailPrivacy' : 'onboarding.detailsPrivacy')}</AppText>
        {save.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(save.error)} /> : null}
      </View>
      <View style={{ flex: 1, minHeight: spacing.xl }} />
      <AppButton label={t('common.continue')} disabled={!user || !emailValid || !idValid || !nameValid} loading={save.isPending} onPress={submit} testID="details-continue" />
    </Screen>
  );
}
