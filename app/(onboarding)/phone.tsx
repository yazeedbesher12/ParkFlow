import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Check, ChevronDown } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  BottomSheet,
  Divider,
  InlineNotice,
  PressableScale,
  Reveal,
  Screen,
  TextField,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { services } from '@/services';
import { formatPhone, isValidPalestinianMobile, normalizePhone } from '@/utils/phone';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

/** Palestine dials +970; +972 numbers are also in use, so both are offered. */
const COUNTRY_CODES = [
  { code: '+970', flag: '🇵🇸', name: 'Palestine' },
  { code: '+972', flag: '🇮🇱', name: 'Israel' },
];

export default function PhoneScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row } = useLocale();

  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0]!.code);
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);

  const national = normalizePhone(phone);
  const isValid = isValidPalestinianMobile(national);
  const showError = touched && national.length > 0 && !isValid;

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode) ?? COUNTRY_CODES[0]!;

  const requestOtp = useMutation({
    mutationFn: () => services.auth.requestOtp({ countryCode, phone: national }),
    onSuccess: (challenge) => {
      haptics.success();
      router.push({
        pathname: '/(onboarding)/otp',
        params: {
          challengeId: challenge.challengeId,
          phone: challenge.phone,
          devCode: challenge.devCode ?? '',
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
        <AppText variant="h1">{t('onboarding.phoneTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">
          {t('onboarding.phoneSubtitle')}
        </AppText>
      </Reveal>

      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        {/*
          The country code lives inside the field rather than beside it. Two
          controls side by side cannot both stay legible on a narrow phone —
          this keeps the number the full width of the input at any screen size.
        */}
        <TextField
          label={t('onboarding.phoneLabel')}
          emphasis="strong"
          value={formatPhone(phone)}
          onChangeText={(value) => setPhone(normalizePhone(value))}
          onBlur={() => setTouched(true)}
          placeholder="59 123 4567"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus
          maxLength={12}
          error={showError ? t('onboarding.phoneInvalid') : undefined}
          leading={
            <PressableScale
              onPress={() => {
                haptics.select();
                setCodeSheetOpen(true);
              }}
              scaleTo={0.94}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${t('onboarding.countryCode')} ${selectedCountry.code}`}
              style={{
                flexDirection: row,
                alignItems: 'center',
                gap: spacing.xs,
                paddingEnd: spacing.md,
                borderEndWidth: 1,
                borderEndColor: colors.border,
              }}
            >
              <AppText variant="titleLg" numeric forceLtrAlign>
                {selectedCountry.flag} {selectedCountry.code}
              </AppText>
              <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.4} />
            </PressableScale>
          }
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
          testID="phone-continue"
        />
      </View>

      <BottomSheet
        visible={codeSheetOpen}
        onClose={() => setCodeSheetOpen(false)}
        title={t('onboarding.countryCode')}
      >
        <View>
          {COUNTRY_CODES.map((option, index) => {
            const active = option.code === countryCode;
            return (
              <View key={option.code}>
                {index > 0 ? <Divider /> : null}
                <PressableScale
                  onPress={() => {
                    haptics.select();
                    setCountryCode(option.code);
                    setCodeSheetOpen(false);
                  }}
                  scaleTo={0.99}
                  dimTo={0.65}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${option.name} ${option.code}`}
                  style={{
                    flexDirection: row,
                    alignItems: 'center',
                    gap: spacing.md,
                    paddingVertical: spacing.lg,
                  }}
                >
                  <AppText variant="h3">{option.flag}</AppText>
                  <AppText variant="titleLg" style={{ flex: 1 }}>
                    {option.name}
                  </AppText>
                  <AppText variant="titleLg" color="textSecondary" numeric forceLtrAlign>
                    {option.code}
                  </AppText>
                  {active ? <Check size={20} color={colors.brand} strokeWidth={2.8} /> : null}
                </PressableScale>
              </View>
            );
          })}
        </View>
      </BottomSheet>
    </Screen>
  );
}
