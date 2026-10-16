import { Stack } from 'expo-router';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
export default function AdminLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }} />;
}
