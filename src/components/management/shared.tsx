import { View } from "react-native";
import { AppButton, AppText, InlineNotice } from "@/components/ui";
import { useLocale } from "@/hooks/useLocale";
import { spacing } from "@/theme/spacing";
import { AppError } from "@/utils/errors";
import type { ZoneLifecycle, MemberRole } from "@/types/management";

export const lifecycleNames: Record<ZoneLifecycle, [string, string]> = {
  draft: ["مسودة", "Draft"],
  review: ["بانتظار المراجعة", "In review"],
  published: ["منشور", "Published"],
  suspended: ["معلّق", "Suspended"],
  archived: ["مؤرشف", "Archived"],
};
export const roleNames: Record<MemberRole | "admin", [string, string]> = {
  owner: ["مالك", "Owner"],
  manager: ["مدير", "Manager"],
  attendant: ["موظف بوابة", "Attendant"],
  admin: ["أدمن المنصة", "Platform admin"],
};
export function useManagementText() {
  const { locale } = useLocale();
  return (ar: string, en: string) => (locale === "ar" ? ar : en);
}
export function ManagementError({
  error,
  reload,
}: {
  error: unknown;
  reload?: () => void;
}) {
  const text = useManagementText();
  if (!error) return null;
  const appError = error instanceof AppError ? error : null;
  const code = appError?.details?.serverCode;
  const messages: Record<string, [string, string]> = {
    STALE_VERSION: [
      "عدّل شخص آخر هذا الموقف. أعد تحميل البيانات قبل الحفظ.",
      "Someone else changed this location. Reload before saving.",
    ],
    ZONE_IN_USE: [
      "يوجد حجز قائم أو جلسة نشطة متأثرة. عالج الحجوزات أولاً ثم أعد المحاولة.",
      "Existing reservations or active sessions are affected. Resolve them before retrying.",
    ],
    FORBIDDEN: [
      "صلاحيتك الحالية لا تسمح بهذه العملية.",
      "Your current role does not allow this action.",
    ],
    LAST_OWNER: [
      "أضف مالكاً آخر قبل إزالة المالك الأخير.",
      "Assign another owner before removing the last owner.",
    ],
    ZONE_INCOMPLETE: [
      "أكمل السعة والسعر الحالي وساعات الأيام السبعة قبل النشر.",
      "Set capacity, a current tariff and all seven operating days before publishing.",
    ],
    TARIFF_OVERLAP: [
      "يتداخل السعر مع فترة سعر مجدول. اختر فترة أخرى.",
      "This tariff overlaps a scheduled tariff. Choose another interval.",
    ],
    CLOSURE_OVERLAP: [
      "يتداخل الإغلاق مع إغلاق آخر.",
      "This closure overlaps an existing closure.",
    ],
  };
  const body =
    typeof code === "string" && messages[code]
      ? text(...messages[code])
      : error instanceof Error
        ? error.message
        : text("تعذّر حفظ التعديل.", "Could not save changes.");
  return (
    <View style={{ gap: spacing.sm }}>
      <InlineNotice
        tone="danger"
        title={text("لم يُحفظ التعديل", "Changes were not saved")}
        body={body}
      />
      {code === "STALE_VERSION" && reload ? (
        <AppButton
          label={text("إعادة تحميل البيانات", "Reload data")}
          onPress={reload}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}
export function SectionTitle({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="h3">{title}</AppText>
      {body ? (
        <AppText variant="bodySm" color="textSecondary">
          {body}
        </AppText>
      ) : null}
    </View>
  );
}
export function numeric(value: string, label: string) {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(label);
  return Number(value);
}
export function isoDate(value: string, label: string) {
  if (!/(Z|[+-]\d\d:\d\d)$/.test(value.trim())) throw new Error(label);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(label);
  return date.toISOString();
}
