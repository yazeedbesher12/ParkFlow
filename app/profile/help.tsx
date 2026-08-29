import { Linking, View } from 'react-native';
import { CircleHelp, Mail, MessageCircle, Phone } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Card,
  Divider,
  ListItem,
  Screen,
  SectionHeader,
} from '@/components/ui';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';

const SUPPORT_PHONE = '+970 2 298 0000';
const SUPPORT_EMAIL = 'support@parkflow.ps';

/** Short answers to the questions the flows actually raise. */
const FAQ = [
  {
    q: 'Can I park two cars at the same time?',
    a: 'Yes. Each vehicle runs its own session, so two cars on your account can be parked at once. A single vehicle can only have one session running.',
  },
  {
    q: 'What happens if I close the app while parked?',
    a: 'Nothing. The session lives on the server and keeps running. Reopen the app and the timer picks up exactly where it should be.',
  },
  {
    q: 'When am I charged?',
    a: 'Prepaid parking is paid when you start. Start/stop parking is settled from your wallet when you stop. Your card is only charged when you top up.',
  },
  {
    q: 'The price changed while I was parked — which one applies?',
    a: 'The rate shown when you started. A session keeps the tariff it began with.',
  },
];

export default function HelpScreen() {
  const { colors } = useTheme();
  const { t, row } = useLocale();

  const iconProps = { size: 19, color: colors.textSecondary, strokeWidth: 2.1 } as const;

  const MenuIcon = ({ children }: { children: React.ReactNode }) => (
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
      {children}
    </View>
  );

  return (
    <Screen>
      <AppHeader title={t('profile.help')} />

      <View style={{ gap: spacing.xl }}>
        <View
          style={{
            flexDirection: row,
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.lg,
            backgroundColor: colors.brandSofter,
          }}
        >
          <MessageCircle size={22} color={colors.brand} strokeWidth={2.1} />
          <AppText variant="bodySm" color="textSecondary" style={{ flex: 1 }}>
            {t('profile.helpBody')}
          </AppText>
        </View>

        <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
          <ListItem
            title={t('profile.callSupport')}
            subtitle={SUPPORT_PHONE}
            leading={<MenuIcon><Phone {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => {
              void Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`).catch(() => undefined);
            }}
          />
          <Divider inset={52} />
          <ListItem
            title={t('profile.emailSupport')}
            subtitle={SUPPORT_EMAIL}
            leading={<MenuIcon><Mail {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => {
              void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => undefined);
            }}
          />
        </Card>

        <View>
          <SectionHeader
            title={t('profile.faq')}
            trailing={<CircleHelp size={20} color={colors.textTertiary} strokeWidth={2.1} />}
          />
          <Card padding="lg" style={{ gap: spacing.lg }}>
            {FAQ.map((item, index) => (
              <View key={item.q} style={{ gap: spacing.sm }}>
                {index > 0 ? <Divider style={{ marginBottom: spacing.md }} /> : null}
                <AppText variant="titleLg">{item.q}</AppText>
                <AppText variant="body" color="textSecondary">
                  {item.a}
                </AppText>
              </View>
            ))}
          </Card>
        </View>
      </View>
    </Screen>
  );
}
