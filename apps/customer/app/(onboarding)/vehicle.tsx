import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppButton, AppText, InlineNotice, OnboardingStepper, Reveal, Screen } from '@parkflow/client/components/ui';
import { VehicleForm } from '../../src/components/domain/VehicleForm';
import { spacing } from '@parkflow/design/spacing';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useBlockHardwareBack } from '@parkflow/client/hooks/useBlockHardwareBack';
import { useAddVehicle } from '@parkflow/client/hooks/useVehicles';
import { usePreferencesStore } from '@parkflow/client/store/preferencesStore';
import { usePhoneAuthStore } from '@parkflow/client/store/phoneAuthStore';
import { errorMessage } from '@parkflow/client/utils/errors';
import { haptics } from '@parkflow/client/utils/haptics';

export default function AddFirstVehicleScreen() {
  // The account already exists by this point — see useBlockHardwareBack.
  useBlockHardwareBack();
  const router = useRouter();
  const { t } = useLocale();
  const addVehicle = useAddVehicle();
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);

  const finish = () => {
    usePhoneAuthStore.getState().setVehicleSetup(undefined);
    completeOnboarding();
    router.replace('/(tabs)/map');
  };

  return (
    <Screen keyboardAvoiding>
      <View style={{ height: spacing.giant }} />
      <OnboardingStepper current={3} />

      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.vehicleTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">
          {t('onboarding.vehicleSubtitle')}
        </AppText>
      </Reveal>

      <View style={{ marginTop: spacing.xxl, gap: spacing.lg }}>
        {addVehicle.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(addVehicle.error)}
          />
        ) : null}

        <VehicleForm
          submitLabel={t('vehicle.add')}
          isSubmitting={addVehicle.isPending}
          onSubmit={(input) =>
            addVehicle.mutate(input, {
              onSuccess: () => {
                haptics.success();
                finish();
              },
              onError: () => haptics.error(),
            })
          }
        />

        <AppButton
          label={t('common.skip')}
          variant="ghost"
          size="md"
          onPress={finish}
          disabled={addVehicle.isPending}
        />
      </View>
    </Screen>
  );
}
