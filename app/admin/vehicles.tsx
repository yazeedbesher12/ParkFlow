import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldCheck } from 'lucide-react-native';

import { AppButton, AppHeader, AppText, BottomSheet, Card, ErrorState, InlineNotice, Screen, Segmented, StatusBadge, TextField } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { vehicleVerificationService, type VehicleVerificationDecision, type VehicleVerificationLink, type VehicleVerificationRole } from '@/services/http/vehicleVerificationService';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { errorMessage } from '@/utils/errors';
import { formatDateTime } from '@/utils/time';

type StatusFilter = 'all' | 'pending' | 'verified';
const PAGE_SIZE = 20;
const roleNames = {
  owner: { en: 'Owner', ar: 'مالك' },
  driver: { en: 'Driver', ar: 'سائق' },
  manager: { en: 'Manager', ar: 'مدير المركبة' },
};

function AssociationDetails({ link, detailed = false }: { link: VehicleVerificationLink; detailed?: boolean }) {
  const { locale, row, dateLocale } = useLocale();
  const ar = locale === 'ar';
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: row, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="h3" numeric forceLtrAlign>{link.vehicle.plateNumber} · {link.vehicle.region}</AppText>
        <StatusBadge label={link.verifiedAt ? (ar ? 'موثّق' : 'Verified') : (ar ? 'بانتظار التحقق' : 'Pending verification')} tone={link.verifiedAt ? 'success' : 'warning'} size="sm" />
      </View>
      <AppText variant="title">{link.user.fullName || link.user.email || link.user.phone || link.userId}</AppText>
      {link.user.email ? <AppText variant="bodySm" color="textSecondary" selectable forceLtrAlign>{link.user.email}</AppText> : null}
      {link.user.phone ? <AppText variant="bodySm" color="textSecondary" selectable forceLtrAlign>{link.user.phone}</AppText> : null}
      <AppText variant="caption" color="textSecondary">
        {[link.vehicle.make, link.vehicle.model, roleNames[link.role]?.[locale]].filter(Boolean).join(' · ')}
      </AppText>
      {detailed ? <AppText variant="caption" color="textSecondary" selectable>{ar ? 'معرّف المستخدم: ' : 'User ID: '}{link.userId}</AppText> : null}
      <AppText variant="caption" color="textTertiary">
        {link.verifiedAt ? (ar ? 'تم التحقق: ' : 'Verified: ') : (ar ? 'تاريخ الربط: ' : 'Linked: ')}
        {formatDateTime(link.verifiedAt ?? link.linkedAt, dateLocale)}
      </AppText>
    </View>
  );
}

export default function AdminVehicleVerificationScreen() {
  const { colors } = useTheme();
  const { locale, row, t } = useLocale();
  const ar = locale === 'ar';
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<VehicleVerificationLink | null>(null);
  const [draftVerified, setDraftVerified] = useState(true);
  const [draftRole, setDraftRole] = useState<VehicleVerificationRole>('driver');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [saved, setSaved] = useState(false);
  const linksQuery = useQuery({
    queryKey: ['admin', 'vehicle-verifications', currentUser?.id, submittedSearch],
    queryFn: () => vehicleVerificationService.list(submittedSearch),
    enabled: isAdmin,
  });
  const update = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: VehicleVerificationDecision }) => vehicleVerificationService.update(id, decision),
    retry: false,
    onSuccess: async () => {
      setSelected(null);
      setReason('');
      setSaved(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'vehicle-verifications'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] }),
        ...['vehicles', 'violations', 'violation', 'evidence', 'permits'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      ]);
    },
  });

  useEffect(() => {
    setSelected(null);
    setReason('');
    setSaved(false);
  }, [currentUser?.id, currentUser?.role]);

  const records = linksQuery.data ?? [];
  const filtered = records.filter((link) => filter === 'all' || (filter === 'verified' ? Boolean(link.verifiedAt) : !link.verifiedAt));
  const reasonValid = reason.trim().length >= 10 && reason.trim().length <= 500;
  const title = ar ? 'التحقق من صلاحية المركبات' : 'Vehicle verification';
  const submitSearch = () => {
    const next = search.trim();
    setSubmittedSearch(next);
    setVisibleCount(PAGE_SIZE);
    if (next === submittedSearch) void linksQuery.refetch();
  };
  const openReview = (link: VehicleVerificationLink) => {
    setSelected(link);
    setDraftVerified(true);
    setDraftRole((['owner', 'driver', 'manager'] as string[]).includes(link.role) ? link.role : 'driver');
    setReason('');
    setStep('edit');
    setSaved(false);
    update.reset();
  };

  if (!isAdmin) return <Screen><AppHeader title={title} leading="back" /><ErrorState title={t('admin.accessRequired')} error={new Error(t('admin.accessBody'))} /></Screen>;

  return (
    <Screen keyboardAvoiding contentContainerStyle={{ gap: spacing.lg }}>
      <AppHeader title={title} leading="back" trailing={<AppButton label={t('admin.refresh')} size="sm" variant="secondary" fullWidth={false} loading={linksQuery.isFetching} disabled={update.isPending} onPress={() => void linksQuery.refetch()} />} />
      <InlineNotice
        tone="info"
        title={ar ? 'راجع المستندات قبل منح الصلاحية' : 'Check evidence before granting access'}
        body={ar ? 'تحقق من الملكية أو التفويض عبر إجراءات الدعم المعتمدة. رقم اللوحة وحده ليس إثباتاً. هذه الصفحة تسجل قرار التحقق.' : 'Review ownership or delegated authorization through your support process. A plate alone is not proof. This screen records the verification decision.'}
        icon={<ShieldCheck size={20} color={colors.infoText} />}
      />
      {saved ? <InlineNotice tone="success" title={ar ? 'تم تسجيل القرار' : 'Decision recorded'} body={ar ? 'تم تحديث الصلاحية وحفظ السبب في سجل التدقيق.' : 'Access was updated and the reason was saved in the audit log.'} /> : null}
      <TextField
        label={ar ? 'البحث برقم اللوحة أو البريد أو الهاتف' : 'Search by plate, email or phone'}
        value={search} onChangeText={setSearch} onSubmitEditing={submitSearch} returnKeyType="search"
        autoCapitalize="none" autoCorrect={false} maxLength={200}
        leading={<Search size={20} color={colors.textTertiary} />}
      />
      <AppButton label={ar ? 'بحث' : 'Search'} variant="secondary" size="sm" onPress={submitSearch} disabled={linksQuery.isFetching || update.isPending} />
      <Segmented<StatusFilter> value={filter} onChange={(value) => { setFilter(value); setVisibleCount(PAGE_SIZE); }} options={[
        { value: 'all', label: ar ? 'الكل' : 'All' },
        { value: 'pending', label: ar ? 'بانتظار التحقق' : 'Pending' },
        { value: 'verified', label: ar ? 'موثّق' : 'Verified' },
      ]} />
      <AppText variant="caption" color="textSecondary">
        {ar ? 'تظهر أحدث ٢٠٠ علاقة مطابقة كحد أقصى. استخدم البحث لتضييق النتائج.' : 'Up to the latest 200 matching associations are shown. Search to narrow the results.'}
      </AppText>
      {linksQuery.isPending ? <ActivityIndicator color={colors.brand} accessibilityLabel={t('common.loading')} /> : null}
      {linksQuery.error ? <InlineNotice tone="danger" title={ar ? 'تعذر تحميل القائمة' : 'Could not load associations'} body={errorMessage(linksQuery.error)} action={{ label: t('admin.refresh'), onPress: () => void linksQuery.refetch() }} /> : null}
      {!linksQuery.isPending && !linksQuery.error && filtered.length === 0 ? <Card padding="lg"><AppText color="textSecondary">{ar ? 'لا توجد علاقات مطابقة.' : 'No matching associations.'}</AppText></Card> : null}
      {filtered.slice(0, visibleCount).map((link) => (
        <Card key={link.id} padding="lg" style={{ gap: spacing.md }}>
          <AssociationDetails link={link} />
          <AppButton label={ar ? 'مراجعة الصلاحية' : 'Review access'} variant="secondary" size="sm" onPress={() => openReview(link)} disabled={linksQuery.isFetching || linksQuery.isError || update.isPending} />
        </Card>
      ))}
      {filtered.length > visibleCount ? <AppButton label={ar ? 'عرض المزيد' : 'Show more'} variant="ghost" onPress={() => setVisibleCount((count) => count + PAGE_SIZE)} /> : null}

      <BottomSheet visible={selected !== null} onClose={() => { if (!update.isPending) setSelected(null); }} dismissible={!update.isPending} scrollable title={step === 'edit' ? (ar ? 'مراجعة صلاحية المركبة' : 'Review vehicle access') : (ar ? 'تأكيد قرار التحقق' : 'Confirm verification decision')}>
        {selected ? <View style={{ gap: spacing.lg }}>
          <Card tone="outline" padding="lg"><AssociationDetails link={selected} detailed /></Card>
          {step === 'edit' ? <>
            <AppText variant="label">{ar ? 'قرار التحقق' : 'Verification decision'}</AppText>
            <Segmented value={draftVerified ? 'verify' : 'revoke'} onChange={(value) => { setDraftVerified(value === 'verify'); if (value === 'revoke') setDraftRole('driver'); }} options={[
              { value: 'verify', label: ar ? 'منح صلاحية موثّقة' : 'Verify access' },
              { value: 'revoke', label: ar ? 'سحب التوثيق' : 'Revoke verification' },
            ]} />
            {draftVerified ? <>
              <AppText variant="label">{ar ? 'الدور المثبت بالمستندات' : 'Role supported by reviewed evidence'}</AppText>
              <Segmented<VehicleVerificationRole> value={draftRole} onChange={setDraftRole} options={(Object.keys(roleNames) as VehicleVerificationRole[]).map((value) => ({ value, label: roleNames[value][locale] }))} />
            </> : <AppText color="textSecondary">{ar ? 'عند سحب التوثيق يبقى الشخص سائقاً دون صلاحية السجلات الحساسة.' : 'Revocation retains the driver association without sensitive record access.'}</AppText>}
            <TextField
              label={ar ? 'السبب / مرجع الإثبات الذي تمت مراجعته' : 'Reason / reviewed evidence reference'}
              hint={ar ? 'من ١٠ إلى ٥٠٠ حرف. اذكر مرجع الحالة أو المستند، دون نسخ محتوى المستند.' : '10–500 characters. Record the case or document reference, without copying its contents.'}
              value={reason} onChangeText={setReason} multiline maxLength={500} inputStyle={{ minHeight: 112, paddingVertical: spacing.md }}
              error={reason.length > 0 && !reasonValid ? (ar ? 'أدخل سبباً من ١٠ إلى ٥٠٠ حرف.' : 'Enter a reason of 10–500 characters.') : undefined}
            />
            <AppButton label={ar ? 'مراجعة القرار' : 'Review decision'} onPress={() => setStep('review')} disabled={!reasonValid} />
          </> : <>
            <InlineNotice tone={draftVerified ? 'warning' : 'danger'} title={draftVerified ? (ar ? 'سيُمنح حق الاطلاع على السجلات الحساسة' : 'Sensitive record access will be granted') : (ar ? 'سيُسحب حق الاطلاع على السجلات الحساسة' : 'Sensitive record access will be revoked')} body={ar ? 'راجع الشخص ورقم اللوحة أعلاه قبل التأكيد.' : 'Confirm the person and plate shown above before proceeding.'} />
            <AppText variant="title">{ar ? 'الدور: ' : 'Role: '}{roleNames[draftVerified ? draftRole : 'driver'][locale]}</AppText>
            <AppText variant="label" color="textSecondary">{ar ? 'السبب المسجّل' : 'Recorded reason'}</AppText>
            <AppText selectable>{reason.trim()}</AppText>
            {update.error ? <InlineNotice tone="danger" title={ar ? 'تعذر تأكيد القرار' : 'Could not confirm decision'} body={errorMessage(update.error)} /> : null}
            <AppButton
              label={draftVerified ? (ar ? 'تأكيد منح الصلاحية' : 'Confirm verified access') : (ar ? 'تأكيد سحب التوثيق' : 'Confirm revocation')}
              variant={draftVerified ? 'primary' : 'danger'} loading={update.isPending} disabled={!reasonValid}
              onPress={() => { if (selected && reasonValid && !update.isPending) update.mutate({ id: selected.id, decision: { verified: draftVerified, role: draftVerified ? draftRole : 'driver', reason: reason.trim() } }); }}
            />
            <AppButton label={ar ? 'تعديل القرار' : 'Edit decision'} variant="secondary" onPress={() => { update.reset(); setStep('edit'); }} disabled={update.isPending} />
          </>}
          <View style={{ flexDirection: row }}><AppButton label={t('common.cancel')} variant="ghost" onPress={() => setSelected(null)} disabled={update.isPending} /></View>
        </View> : null}
      </BottomSheet>
    </Screen>
  );
}
