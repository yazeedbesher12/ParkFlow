import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { X } from 'lucide-react-native';

import { AppText } from '@parkflow/client/components/ui/AppText';
import { PressableScale } from '@parkflow/client/components/ui/PressableScale';
import { NOTIFICATION_ICONS } from '../domain/notificationIcons';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { spacing, screenPadding } from '@parkflow/design/spacing';
import { radius } from '@parkflow/design/radius';
import { shadow } from '@parkflow/design/shadows';
import { zIndex } from '@parkflow/design/zIndex';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useMarkNotificationRead } from '@parkflow/client/hooks/useNotifications';
import { useInAppNotificationStore } from '@parkflow/client/store/inAppNotificationStore';
import { haptics } from '@parkflow/client/utils/haptics';
import { useAuthStore } from '@parkflow/client/store/authStore';

const VISIBLE_MS = 6000;

/**
 * Pops a live notification over whatever screen is open — points earned,
 * parking reminders, payments. Tapping opens it; it also leaves on its own.
 */
export function NotificationBanner() {
  const router = useRouter();
  const { colors } = useTheme();
  const { locale, row, t } = useLocale();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.session?.userId);
  const pendingNotification = useInAppNotificationStore((s) => s.current);
  const notification = pendingNotification?.userId === userId ? pendingNotification : undefined;
  const dismiss = useInAppNotificationStore((s) => s.dismiss);
  const markRead = useMarkNotificationRead();

  useEffect(() => {
    if (!notification) return;
    haptics.success();
    const timer = setTimeout(dismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notification, dismiss]);

  if (!notification) return null;

  const Icon = NOTIFICATION_ICONS[notification.type] ?? NOTIFICATION_ICONS.system;
  const reward = notification.type === 'points_awarded' || notification.type === 'reward_paid';
  const title = locale === 'ar' ? notification.titleAr : notification.title;
  const body = locale === 'ar' ? notification.bodyAr : notification.body;

  const open = () => {
    if (useAuthStore.getState().session?.userId !== notification.userId) return;
    dismiss();
    markRead.mutate(notification.id);
    router.push((notification.href ?? '/notifications') as Href);
  };

  return (
    <Animated.View
      key={notification.id}
      // No exit animation: on web it can stall and leave the banner stuck on screen.
      entering={FadeInUp.duration(260)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + spacing.sm,
        left: screenPadding,
        right: screenPadding,
        zIndex: zIndex.toast,
      }}
    >
      <PressableScale
        onPress={open}
        scaleTo={0.98}
        accessibilityRole="alert"
        accessibilityLabel={`${title}. ${body}`}
        style={[
          {
            flexDirection: row,
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: reward ? colors.brandSoft : colors.border,
          },
          shadow.lg,
        ]}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: reward ? colors.brandSoft : colors.surfaceAlt,
          }}
        >
          <Icon size={22} color={reward ? colors.brand : colors.textSecondary} strokeWidth={2.2} />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="bodySm" color="textSecondary" numberOfLines={2}>
            {body}
          </AppText>
        </View>

        <PressableScale
          onPress={dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <X size={18} color={colors.textTertiary} strokeWidth={2.2} />
        </PressableScale>
      </PressableScale>
    </Animated.View>
  );
}
