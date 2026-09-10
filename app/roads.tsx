import { useState } from 'react';
import { View } from 'react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  InlineNotice,
  PressableScale,
  Screen,
  SectionHeader,
  Skeleton,
  StatusBadge,
  TextField,
} from '@/components/ui';
import { CheckpointIcon, checkpointColor } from '@/components/map/CheckpointMarker';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import {
  useCheckpoints,
  useReportCheckpoint,
  useRoadFeed,
  useSubmitRoadPost,
} from '@/hooks/useCommunity';
import { SAMPLE_ROAD_POSTS } from '@/services';
import type { CheckpointState, CheckpointStatus } from '@/types';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

const STATUSES: CheckpointStatus[] = ['open', 'congested', 'closed'];
const STATUS_TONE = { open: 'success', congested: 'warning', closed: 'danger' } as const;
const SEVERITY: Record<CheckpointStatus, number> = { closed: 0, congested: 1, open: 2 };

const minutesSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

/**
 * Road alerts — Wusool's road intelligence inside ParkFlow: live checkpoint
 * status, one-tap driver reports, and a reader for the Telegram/WhatsApp posts
 * drivers already share.
 */
export default function RoadAlertsScreen() {
  const { colors } = useTheme();
  const { t, row, locale } = useLocale();
  const { data: checkpoints, isPending, isError, error, refetch } = useCheckpoints();
  const { data: feed = [] } = useRoadFeed();
  const report = useReportCheckpoint();
  const submit = useSubmitRoadPost();

  const [expanded, setExpanded] = useState<string | undefined>();
  const [thanks, setThanks] = useState<{ checkpointId: string; points: number } | undefined>();
  const [post, setPost] = useState('');
  const [sample, setSample] = useState(0);

  const nameOf = (c: { nameAr: string; nameEn: string }) => (locale === 'ar' ? c.nameAr : c.nameEn);
  const ago = (minutes: number) => (minutes < 1 ? t('roads.justNow') : t('roads.minutesAgo', { minutes }));

  const sorted = [...(checkpoints ?? [])].sort(
    (a, b) => Number(a.assumed) - Number(b.assumed) || SEVERITY[a.status] - SEVERITY[b.status],
  );

  const sendReport = (checkpoint: CheckpointState, status: CheckpointStatus) => {
    haptics.select();
    report.mutate(
      { checkpointId: checkpoint.id, status },
      {
        onSuccess: (result) => {
          haptics.success();
          setThanks({ checkpointId: checkpoint.id, points: result.points?.points ?? 0 });
        },
        onError: () => haptics.error(),
      },
    );
  };

  const readPost = () => {
    if (!post.trim()) return;
    submit.mutate(post, {
      onSuccess: (result) => (result.event ? haptics.success() : haptics.warning()),
    });
  };

  const trySample = () => {
    setPost(SAMPLE_ROAD_POSTS[sample % SAMPLE_ROAD_POSTS.length]!);
    setSample((n) => n + 1);
    submit.reset();
  };

  return (
    <Screen keyboardAvoiding bottomInset={spacing.lg}>
      <AppHeader title={t('roads.title')} subtitle={t('roads.subtitle')} />

      <View style={{ gap: spacing.xl }}>
        {/* ---- Checkpoints ---------------------------------------------- */}
        <View>
          <SectionHeader title={t('roads.checkpoints')} subtitle={t('roads.reportPrompt')} />
          {isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isPending ? (
            <Skeleton height={320} radiusToken="xl" />
          ) : (
            <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
              {sorted.map((checkpoint, index) => {
                const color = checkpointColor(checkpoint.status, checkpoint.assumed, colors);
                const open = expanded === checkpoint.id;
                return (
                  <View key={checkpoint.id}>
                    {index > 0 ? <Divider /> : null}
                    <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
                      <PressableScale
                        onPress={() => {
                          haptics.select();
                          setExpanded(open ? undefined : checkpoint.id);
                        }}
                        scaleTo={0.99}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        accessibilityLabel={nameOf(checkpoint)}
                        style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: radius.md,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: colors.surfaceAlt,
                          }}
                        >
                          <CheckpointIcon status={checkpoint.status} color={color} size={18} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText variant="title" numberOfLines={1}>
                            {nameOf(checkpoint)}
                          </AppText>
                          <AppText variant="caption" color="textTertiary">
                            {checkpoint.assumed
                              ? t('roads.noReports')
                              : t('roads.reportedAgo', {
                                  ago: ago(checkpoint.minutesSinceReport ?? 0),
                                  count: checkpoint.reportCount,
                                })}
                          </AppText>
                        </View>
                        <StatusBadge
                          label={
                            checkpoint.assumed
                              ? t('roads.assumed')
                              : t(`roads.status.${checkpoint.status}` as const)
                          }
                          tone={checkpoint.assumed ? 'neutral' : STATUS_TONE[checkpoint.status]}
                          size="sm"
                        />
                      </PressableScale>

                      {open ? (
                        <View style={{ flexDirection: row, gap: spacing.sm }}>
                          {STATUSES.map((status) => (
                            <AppButton
                              key={status}
                              label={t(`roads.status.${status}` as const)}
                              variant="secondary"
                              size="sm"
                              style={{ flex: 1 }}
                              loading={
                                report.isPending &&
                                report.variables?.checkpointId === checkpoint.id &&
                                report.variables?.status === status
                              }
                              disabled={report.isPending}
                              onPress={() => sendReport(checkpoint, status)}
                            />
                          ))}
                        </View>
                      ) : null}

                      {thanks?.checkpointId === checkpoint.id ? (
                        <AppText variant="caption" color="successText">
                          {thanks.points
                            ? t('roads.reportThanksPoints', { points: thanks.points })
                            : t('roads.reportThanks')}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </View>

        {/* ---- Read a community post ------------------------------------ */}
        <View>
          <SectionHeader title={t('roads.readPost')} subtitle={t('roads.readPostHint')} />
          <Card padding="lg" style={{ gap: spacing.md }}>
            <TextField
              value={post}
              onChangeText={(value) => {
                setPost(value);
                submit.reset();
              }}
              placeholder={t('roads.readPostPlaceholder')}
              multiline
              numberOfLines={3}
              inputStyle={{ minHeight: 88, alignItems: 'flex-start', paddingVertical: spacing.md }}
            />
            <View style={{ flexDirection: row, gap: spacing.sm }}>
              <AppButton
                label={t('roads.trySample')}
                variant="secondary"
                size="sm"
                style={{ flex: 1 }}
                onPress={trySample}
              />
              <AppButton
                label={t('roads.readPostAction')}
                size="sm"
                style={{ flex: 1 }}
                disabled={!post.trim()}
                loading={submit.isPending}
                onPress={readPost}
                testID="read-road-post"
              />
            </View>

            {submit.data?.event && submit.data.checkpoint && submit.data.status ? (
              <InlineNotice
                tone="info"
                title={t('roads.postMatched', {
                  name: nameOf(submit.data.checkpoint),
                  status: t(`roads.status.${submit.data.status}` as const),
                })}
                body={t('roads.postMatchedBody')}
              />
            ) : submit.data ? (
              <InlineNotice
                tone="warning"
                title={t('roads.postUnmatched')}
                body={t('roads.postUnmatchedBody')}
              />
            ) : null}

            {submit.isError ? (
              <InlineNotice
                tone="danger"
                title={t('common.somethingWrong')}
                body={errorMessage(submit.error)}
              />
            ) : null}
          </Card>
        </View>

        {/* ---- Feed ----------------------------------------------------- */}
        <View>
          <SectionHeader title={t('roads.feed')} />
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {feed.length === 0 ? (
              <EmptyState compact title={t('roads.feedEmpty')} />
            ) : (
              feed.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={{ paddingVertical: spacing.md, gap: spacing.xs }}>
                    <AppText variant="body">{item.rawText ?? t('roads.driverReport')}</AppText>
                    <View
                      style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}
                    >
                      <StatusBadge
                        label={t(`roads.status.${item.status}` as const)}
                        tone={STATUS_TONE[item.status]}
                        size="sm"
                      />
                      <AppText variant="caption" color="textSecondary">
                        {locale === 'ar' ? item.checkpointNameAr : item.checkpointNameEn}
                      </AppText>
                      <AppText variant="caption" color="textTertiary">
                        {t(`roads.source.${item.source}` as const)} · {ago(minutesSince(item.reportedAt))}
                      </AppText>
                    </View>
                  </View>
                </View>
              ))
            )}
          </Card>
        </View>
      </View>
    </Screen>
  );
}
