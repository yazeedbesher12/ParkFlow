import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppButton, AppText, Card, InlineNotice, SwitchRow } from '@/components/ui';
import { healthProfileService } from '@/services/http/healthProfileService';
import { useAuthStore } from '@/store/authStore';
import { useLocale } from '@/hooks/useLocale';
import { spacing } from '@/theme/spacing';
import { errorMessage } from '@/utils/errors';
import { EMPTY_MOBILITY, HEALTH_CONDITIONS, MOBILITY_KEYS, toggleHealthCondition, type HealthCondition, type MobilityPreferences } from '@/types/health';
import type { User } from '@/types';

export function HealthProfileForm({ editing = false, onSaved }: { editing?: boolean; onSaved: (user: User) => void }) {
  const { t } = useLocale();
  const userId = useAuthStore(s => s.user?.id);
  const client = useQueryClient();
  const [conditions, setConditions] = useState<HealthCondition[]>([]);
  const [mobility, setMobility] = useState<MobilityPreferences>({ ...EMPTY_MOBILITY });
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!editing) return;
    let active = true;
    setLoading(true); setLoadFailed(false); setError(undefined);
    // Sensitive selections stay in this screen's memory, never the shared query
    // cache, AsyncStorage, auth response or analytics.
    void healthProfileService.get().then(profile => {
      if (!active) return;
      setConditions(profile?.conditions ?? []);
      setMobility(profile?.mobility ?? { ...EMPTY_MOBILITY });
      setConsent(profile?.consent ?? false);
    }).catch(err => { if (active) { setError(err); setLoadFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editing, userId, reload]);

  const submit = async (remove = false) => {
    setBusy(true); setError(undefined);
    const owner = userId;
    try {
      const user = remove ? await healthProfileService.delete() : await healthProfileService.save(consent
        ? { conditions, mobility, consent: true }
        : { conditions: ['prefer_not_to_disclose'], mobility: { ...EMPTY_MOBILITY }, consent: false });
      if (useAuthStore.getState().user?.id !== owner) return;
      useAuthStore.getState().setUser(user);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['roads'] }),
        client.invalidateQueries({ queryKey: ['route'] }),
      ]);
      onSaved(user);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return <View style={{ gap: spacing.lg }}>
    <AppText color="textSecondary">{t('health.intro')}</AppText>
    <AppText variant="caption" color="textSecondary">{t('health.privacy')}</AppText>
    {loading ? <AppText>{t('common.loading')}</AppText> : null}
    {error ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(error)} /> : null}
    {loadFailed ? <AppButton label={t('common.retry')} onPress={() => setReload(n => n + 1)} /> : null}
    {!loading && !loadFailed ? <>
      <AppText variant="h3">{t('health.conditions')}</AppText>
      <Card padding="lg" style={{ gap: spacing.sm }}>
        {HEALTH_CONDITIONS.map(option => <SwitchRow key={option}
          label={t(`health.condition.${option}`)} value={conditions.includes(option)} disabled={busy}
          onValueChange={() => setConditions(current => toggleHealthCondition(current, option))} />)}
      </Card>
      <AppText variant="h3">{t('health.mobility')}</AppText>
      <AppText variant="bodySm" color="textSecondary">{t('health.independent')}</AppText>
      <Card padding="lg" style={{ gap: spacing.sm }}>
        {MOBILITY_KEYS.map(option => <SwitchRow key={option} label={t(`health.mobility.${option}`)}
          value={mobility[option]} disabled={busy} onValueChange={value => setMobility(current => ({ ...current, [option]: value }))} />)}
      </Card>
      <InlineNotice tone="info" title={t('health.routeLimitsTitle')} body={t('health.routeLimits')} />
      <SwitchRow label={t('health.consent')} description={t('health.consentBody')}
        value={consent} disabled={busy} onValueChange={setConsent} />
      <AppButton label={consent ? t('health.save') : t('health.withoutSaving')}
        disabled={conditions.length === 0 || busy} loading={busy} onPress={() => void submit()} />
      {editing ? <AppButton label={t('health.delete')} variant="ghost" disabled={busy} onPress={() => void submit(true)} /> : null}
    </> : null}
  </View>;
}
