import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing, screenPadding } from '@/theme/spacing';
import { duration, easing, spring } from '@/theme/motion';
import { shadow } from '@/theme/shadows';
import { haptics } from '@/utils/haptics';
import { useInstantMotion } from '@/hooks/useInstantMotion';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Disables drag-to-dismiss and backdrop taps for destructive confirmations. */
  dismissible?: boolean;
  /** Removes the default horizontal padding for edge-to-edge content. */
  edgeToEdge?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Past this drag distance (or flick speed) the sheet commits to closing. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 900;
/** Off-screen parking spot before the real height is measured. */
const OFFSCREEN = 1000;

export function BottomSheet({
  visible,
  onClose,
  children,
  title,
  subtitle,
  dismissible = true,
  edgeToEdge = false,
  contentStyle,
  testID,
}: BottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // With reduced motion (or no animation frames) the sheet snaps rather than
  // slides — it must never be left parked off-screen.
  const instant = useInstantMotion();

  // Kept mounted while closing so the exit animation can play out.
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(0);
  const isOpen = useRef(false);

  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

  const finishClose = useCallback(() => {
    setMounted(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  /**
   * Opening waits for the measured height so the sheet can slide up by exactly
   * its own size.
   */
  useEffect(() => {
    if (!mounted || !visible || isOpen.current || height === 0) return;

    isOpen.current = true;
    if (instant) {
      translateY.value = 0;
      backdrop.value = 1;
      return;
    }
    translateY.value = height;
    translateY.value = withSpring(0, spring.sheet);
    backdrop.value = withTiming(1, { duration: duration.normal });
  }, [visible, mounted, height, instant, translateY, backdrop]);

  /**
   * Closing must never depend on having measured anything: if the height is
   * still unknown the sheet simply disappears rather than staying stuck open.
   */
  useEffect(() => {
    if (visible || !mounted) return;

    isOpen.current = false;

    if (instant || height === 0) {
      translateY.value = OFFSCREEN;
      backdrop.value = 0;
      setMounted(false);
      return;
    }

    backdrop.value = withTiming(0, { duration: duration.fast });
    translateY.value = withTiming(
      height,
      { duration: duration.normal, easing: easing.accelerate },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [visible, mounted, height, instant, translateY, backdrop]);

  const pan = Gesture.Pan()
    .enabled(dismissible)
    .onChange((event) => {
      // Only downward drags move the sheet; upward is clamped.
      translateY.value = Math.max(0, translateY.value + event.changeY);
    })
    .onEnd((event) => {
      const shouldClose =
        translateY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
      if (shouldClose) {
        backdrop.value = withTiming(0, { duration: duration.fast });
        translateY.value = withTiming(
          height || OFFSCREEN,
          { duration: duration.fast, easing: easing.accelerate },
          (finished) => {
            if (finished) runOnJS(finishClose)();
          },
        );
      } else {
        translateY.value = withSpring(0, spring.sheet);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const handleBackdropPress = () => {
    if (!dismissible) return;
    haptics.light();
    onClose();
  };

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissible ? onClose : undefined}
      testID={testID}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            onPress={handleBackdropPress}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <View style={styles.anchor} pointerEvents="box-none">
          <GestureDetector gesture={pan}>
            <Animated.View
              onLayout={(event) => {
                const measured = event.nativeEvent.layout.height;
                if (measured > 0 && measured !== height) setHeight(measured);
              }}
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.surface,
                  paddingBottom: insets.bottom + spacing.lg,
                  paddingHorizontal: edgeToEdge ? 0 : screenPadding,
                },
                shadow.xl,
                sheetStyle,
                contentStyle,
              ]}
            >
              {dismissible ? (
                <View style={styles.handleArea}>
                  <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
                </View>
              ) : (
                <View style={{ height: spacing.lg }} />
              )}

              {title ? (
                <View
                  style={{
                    gap: 4,
                    marginBottom: spacing.lg,
                    paddingHorizontal: edgeToEdge ? screenPadding : 0,
                  }}
                >
                  <AppText variant="h2">{title}</AppText>
                  {subtitle ? (
                    <AppText variant="body" color="textSecondary">
                      {subtitle}
                    </AppText>
                  ) : null}
                </View>
              ) : null}

              {children}
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    maxHeight: '90%',
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
});
