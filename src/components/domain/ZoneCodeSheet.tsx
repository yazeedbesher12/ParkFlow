import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Hash, QrCode } from 'lucide-react-native';

import { AppButton, AppText, BottomSheet, InlineNotice, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { services } from '@/services';
import type { ParkingZone } from '@/types';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export interface ZoneCodeSheetProps {
  visible: boolean;
  onClose: () => void;
  onResolved: (zone: ParkingZone) => void;
}

/**
 * Manual zone entry — the fallback when GPS is wrong, indoors or unavailable.
 * QR scanning shares this entry point and resolves to the same code lookup, so
 * adding the camera later does not change any of the surrounding flow.
 */
export function ZoneCodeSheet({ visible, onClose, onResolved }: ZoneCodeSheetProps) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const [code, setCode] = useState('');

  const lookup = useMutation({
    mutationFn: (value: string) => services.parking.getZoneByCode(value),
    onSuccess: (zone) => {
      haptics.success();
      setCode('');
      onResolved(zone);
    },
    onError: () => haptics.error(),
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        setCode('');
        lookup.reset();
        onClose();
      }}
      title={t('map.enterCode')}
      subtitle={t('parking.zoneConfirmBody')}
    >
      <View style={{ gap: spacing.lg }}>
        <TextField
          value={code}
          onChangeText={(value) => setCode(value.toUpperCase())}
          placeholder="RML-023"
          emphasis="strong"
          autoCapitalize="characters"
          autoCorrect={false}
          leading={<Hash size={20} color={colors.textTertiary} strokeWidth={2.2} />}
          error={lookup.isError ? errorMessage(lookup.error) : undefined}
          onSubmitEditing={() => code.trim() && lookup.mutate(code)}
          returnKeyType="go"
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          <QrCode size={22} color={colors.textSecondary} strokeWidth={2.1} />
          <AppText variant="bodySm" color="textSecondary" style={{ flex: 1 }}>
            {t('common.comingSoon')} — {t('map.scanQr')}
          </AppText>
        </View>

        {lookup.isError ? (
          <InlineNotice tone="warning" title={t('map.noZones')} body={t('map.noZonesBody')} />
        ) : null}

        <AppButton
          label={t('common.continue')}
          disabled={code.trim().length < 3}
          loading={lookup.isPending}
          onPress={() => lookup.mutate(code)}
        />
      </View>
    </BottomSheet>
  );
}
