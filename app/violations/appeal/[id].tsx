import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Paperclip, Plus } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  InlineNotice,
  MoneyText,
  PressableScale,
  Screen,
  Skeleton,
  StatusBadge,
  SuccessCheck,
  TextField,
} from '@/components/ui';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useSubmitAppeal, useViolation } from '@/hooks/useViolations';
import type { AppealReason } from '@/types';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

const REASONS: AppealReason[] = [
  'paid_not_recognized',
  'wrong_vehicle',
  'wrong_location',
  'special_permit',
  'technical_issue',
  'other',
];

const MIN_NOTES = 10;

export default function AppealScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: violation, isPending, isError, error, refetch } = useViolation(id);
  const submitAppeal = useSubmitAppeal();

  const [reason, setReason] = useState<AppealReason | undefined>();
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const notesValid = notes.trim().length >= MIN_NOTES;
  const canSubmit = Boolean(reason) && notesValid;

  if (isError) {
    return (
      <Screen>
        <AppHeader title={t('appeal.title')} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (isPending || !violation) {
    return (
      <Screen>
        <AppHeader title={t('appeal.title')} />
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={120} radiusToken="xl" />
          <Skeleton height={280} radiusToken="xl" />
        </View>
      </Screen>
    );
  }

  // ---- Success state -------------------------------------------------------
  if (submitted) {
    return (
      <Screen>
        <AppHeader title={t('appeal.title')} leading="none" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
          <SuccessCheck size={96} />
          <AppText variant="h1" align="center">
            {t('appeal.submitted')}
          </AppText>
          <AppText
            variant="body"
            color="textSecondary"
            align="center"
            style={{ maxWidth: 320 }}
          >
            {t('appeal.submittedBody')}
          </AppText>

          <Card padding="lg" style={{ alignSelf: 'stretch', gap: spacing.md }}>
            <DetailRow label={t('appeal.status')}>
              <StatusBadge label={t('appeal.status.under_review')} tone="info" />
            </DetailRow>
            <Divider />
            <DetailRow
              label={t('appeal.reference')}
              value={submitAppeal.data?.reference ?? violation.reference}
            />
          </Card>

          <AppButton
            label={t('common.done')}
            style={{ alignSelf: 'stretch' }}
            onPress={() => router.replace(`/violations/${violation.id}`)}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen keyboardAvoiding bottomInset={spacing.lg}>
      <AppHeader title={t('appeal.title')} leading="close" />

      <View style={{ gap: spacing.xl }}>
        <Card padding="lg" style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="titleLg">{t(`violation.type.${violation.type}` as const)}</AppText>
            <AppText variant="bodySm" color="textSecondary">
              {violation.reference}
            </AppText>
          </View>
          <MoneyText value={violation.amount} variant="h3" />
        </Card>

        {/* ---- Reason ---------------------------------------------------- */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="overline" color="textTertiary">
            {t('appeal.reason')}
          </AppText>

          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {REASONS.map((option, index) => {
              const active = option === reason;
              return (
                <View key={option}>
                  {index > 0 ? <Divider /> : null}
                  <PressableScale
                    onPress={() => {
                      haptics.select();
                      setReason(option);
                    }}
                    scaleTo={0.99}
                    dimTo={0.65}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(`appeal.reason.${option}` as const)}
                    style={{
                      flexDirection: row,
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingVertical: spacing.md,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? colors.brand : 'transparent',
                        borderWidth: active ? 0 : 2,
                        borderColor: colors.border,
                      }}
                    >
                      {active ? <Check size={14} color={colors.onBrand} strokeWidth={3} /> : null}
                    </View>
                    <AppText variant="titleLg" style={{ flex: 1 }}>
                      {t(`appeal.reason.${option}` as const)}
                    </AppText>
                  </PressableScale>
                </View>
              );
            })}
          </Card>
        </View>

        {/* ---- Notes ------------------------------------------------------ */}
        <TextField
          label={t('appeal.notes')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('appeal.notesPlaceholder')}
          multiline
          numberOfLines={5}
          maxLength={600}
          inputStyle={{ minHeight: 132, alignItems: 'flex-start', paddingVertical: spacing.md }}
          hint={`${notes.trim().length}/600`}
          error={notes.length > 0 && !notesValid ? t('appeal.notesRequired') : undefined}
        />

        {/* ---- Attachments ------------------------------------------------ */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="overline" color="textTertiary">
            {t('appeal.attachments')} · {t('common.optional')}
          </AppText>

          <PressableScale
            onPress={() => haptics.light()}
            disabled
            accessibilityRole="button"
            accessibilityLabel={t('appeal.addAttachment')}
            accessibilityHint={t('common.comingSoon')}
            style={{
              flexDirection: row,
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.lg,
              borderRadius: radius.lg,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.border,
              opacity: 0.7,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <Paperclip size={18} color={colors.textSecondary} strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="titleLg">{t('appeal.addAttachment')}</AppText>
              <AppText variant="caption" color="textTertiary">
                {t('common.comingSoon')}
              </AppText>
            </View>
            <Plus size={18} color={colors.textTertiary} strokeWidth={2.2} />
          </PressableScale>
        </View>

        {submitAppeal.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(submitAppeal.error)}
          />
        ) : null}

        <AppButton
          label={t('appeal.submit')}
          disabled={!canSubmit}
          loading={submitAppeal.isPending}
          onPress={() =>
            submitAppeal.mutate(
              {
                violationId: violation.id,
                reason: reason!,
                notes,
                attachments: [],
              },
              {
                onSuccess: () => {
                  haptics.success();
                  setSubmitted(true);
                },
                onError: () => haptics.error(),
              },
            )
          }
          testID="submit-appeal"
        />
      </View>
    </Screen>
  );
}
