import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import {
  AppButton,
  AppHeader,
  AppText,
  Avatar,
  Card,
  DetailRow,
  Divider,
  InlineNotice,
  Screen,
  TextField,
} from '@/components/ui';

import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useCurrentUser } from '@/hooks/useSession';
import { useAuthStore } from '@/store/authStore';
import { services } from '@/services';
import { formatDate } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';
import { asciiDigits } from '@/utils/authFlow';

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { t, dateLocale } = useLocale();
  const { user } = useCurrentUser();
  const setUser = useAuthStore((s) => s.setUser);

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [nationalId, setNationalId] = useState('');
  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = !normalizedEmail || z.email().max(254).safeParse(normalizedEmail).success;
  const idValid = !nationalId || /^\d{9}$/.test(nationalId);
  const phoneVerified = Boolean(user?.phoneVerifiedAt);

  const save = useMutation({
    mutationFn: () => services.profile.update(user!.id, {
      fullName: fullName.trim(),
      ...(phoneVerified && normalizedEmail !== (user?.email ?? '') ? { email: normalizedEmail || null } : {}),
      ...(phoneVerified && nationalId ? { nationalId } : {}),
    }),
    onSuccess: (updated) => {
      haptics.success();
      setUser(updated);
      setNationalId('');
      router.back();
    },
    onError: () => haptics.error(),
  });

  const nameValid = fullName.trim().length >= 2 && fullName.trim().length <= 60;
  const dirty = fullName !== (user?.fullName ?? '') || normalizedEmail !== (user?.email ?? '') || Boolean(nationalId);

  return (
    <Screen keyboardAvoiding>
      <AppHeader title={t('profile.personalInfo')} />

      <View style={{ gap: spacing.xl }}>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <Avatar name={fullName || user?.fullName} size={84} />
        </View>

        <Card padding="lg" style={{ gap: spacing.lg }}>
          <TextField
            label={t('profile.fullName')}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoComplete="name"
            maxLength={60}
            error={fullName.length > 0 && !nameValid ? t('onboarding.nameInvalid') : undefined}
          />

          <DetailRow label={t('profile.phone')} value={user?.phone ?? undefined} />
          {phoneVerified ? (
            <>
              <AppText variant="bodySm" color="textSecondary">{t('profile.phoneReadOnly')}</AppText>
              <TextField label={t('profile.email')} value={email} onChangeText={setEmail}
                autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254}
                error={!emailValid ? t('onboarding.emailInvalid') : undefined} />
              <AppText variant="bodySm" color="textSecondary">{t('profile.contactUnverified')}</AppText>
              <DetailRow label={t('profile.nationalId')} value={user?.nationalIdMasked ?? '—'} />
              <TextField label={t('profile.nationalIdReplace')} value={nationalId}
                onChangeText={(value) => setNationalId(asciiDigits(value).replace(/\D/g, ''))}
                keyboardType="number-pad" autoComplete="off" maxLength={9}
                error={!idValid ? t('profile.nationalIdInvalid') : undefined} />
              <AppText variant="bodySm" color="textSecondary">{t('profile.nationalIdHint')}</AppText>
            </>
          ) : <DetailRow label={t('profile.email')} value={user?.email ?? undefined} />}
        </Card>

        <Card padding="lg" style={{ gap: spacing.md }}>
          <Divider />
          <DetailRow
            label={t('profile.memberSince')}
            value={user ? formatDate(user.createdAt, dateLocale) : '—'}
          />
        </Card>

        {save.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(save.error)}
          />
        ) : null}

        <AppButton
          label={t('common.save')}
          disabled={!dirty || !nameValid || !emailValid || !idValid}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      </View>
    </Screen>
  );
}
