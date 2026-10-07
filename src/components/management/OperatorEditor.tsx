import { useEffect, useState } from "react";
import { View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import {
  AppButton,
  AppText,
  Card,
  InlineNotice,
  Segmented,
  TextField,
} from "@/components/ui";
import { managementService as service } from "@/services/http/managementService";
import type { ManagementOperator, MemberRole } from "@/types/management";
import { spacing } from "@/theme/spacing";
import {
  ManagementError,
  roleNames,
  SectionTitle,
  useManagementText,
} from "./shared";

const stack = { gap: spacing.lg };
function MemberRow({
  member,
  isAdmin,
  busy,
  onSave,
  onRemove,
}: {
  member: ManagementOperator["members"][number];
  isAdmin: boolean;
  busy: boolean;
  onSave: (role: MemberRole) => void;
  onRemove: () => void;
}) {
  const text = useManagementText();
  const [role, setRole] = useState(member.memberRole);
  useEffect(() => setRole(member.memberRole), [member.memberRole]);
  const allowed = isAdmin || member.memberRole !== "owner";
  return (
    <Card tone="sunken" style={stack}>
      <AppText variant="title">
        {member.user.fullName || member.user.email || member.userId}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {member.user.email ?? member.user.phone ?? member.userId} ·{" "}
        {text(...roleNames[member.memberRole])}
      </AppText>
      {allowed ? (
        <>
          <Segmented
            value={role}
            onChange={setRole}
            options={(isAdmin
              ? ["owner", "manager", "attendant"]
              : ["manager", "attendant"]
            ).map((value) => ({
              value: value as MemberRole,
              label: text(...roleNames[value as MemberRole]),
            }))}
          />
          <View
            style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}
          >
            <AppButton
              label={text("حفظ الصلاحية", "Save role")}
              size="sm"
              variant="secondary"
              fullWidth={false}
              disabled={busy || role === member.memberRole}
              onPress={() => onSave(role)}
            />
            <AppButton
              label={text("إزالة العضوية", "Remove member")}
              size="sm"
              variant="danger"
              fullWidth={false}
              disabled={busy}
              onPress={onRemove}
            />
          </View>
        </>
      ) : null}
    </Card>
  );
}
export function OperatorEditor({
  operator,
  isAdmin,
  onChanged,
  onClose,
}: {
  operator?: ManagementOperator;
  isAdmin: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const text = useManagementText();
  const [name, setName] = useState(operator?.name ?? "");
  const [type, setType] = useState(operator?.type ?? "garage");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<MemberRole>("attendant");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    setName(operator?.name ?? "");
    setType(operator?.type ?? "garage");
  }, [operator?.id, operator?.name, operator?.type]);
  const command = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onSuccess: () => {
      setNotice(true);
      setConfirm(null);
      onChanged();
    },
  });
  const lookup = useMutation({
    mutationFn: () => service.findPeople(operator!.id, search),
  });
  const run = (job: () => Promise<unknown>) => {
    setNotice(false);
    command.mutate(job);
  };
  return (
    <Card padding="lg" style={stack}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: spacing.md,
          alignItems: "center",
        }}
      >
        <AppText variant="h2" style={{ flex: 1 }}>
          {operator
            ? operator.name
            : text("إضافة مؤسسة", "Add an organization")}
        </AppText>
        <AppButton
          label={text("العودة", "Back")}
          variant="ghost"
          fullWidth={false}
          size="sm"
          onPress={onClose}
        />
      </View>
      <ManagementError error={command.error ?? lookup.error} />
      {notice ? (
        <InlineNotice tone="success" title={text("تم الحفظ", "Saved")} />
      ) : null}
      {isAdmin ? (
        <>
          <TextField
            label={text("اسم المؤسسة", "Organization name")}
            value={name}
            onChangeText={setName}
          />
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: "garage", label: text("كراج", "Garage") },
              { value: "municipality", label: text("بلدية", "Municipality") },
              { value: "mall", label: text("مركز تجاري", "Mall") },
              { value: "hospital", label: text("مستشفى", "Hospital") },
            ]}
          />
          <AppButton
            label={
              operator
                ? text("حفظ المؤسسة", "Save organization")
                : text("إنشاء المؤسسة", "Create organization")
            }
            disabled={!name.trim()}
            loading={command.isPending}
            onPress={() =>
              run(async () => {
                if (operator)
                  return service.updateOperator(operator.id, { name, type });
                const created = await service.createOperator({ name, type });
                onClose();
                return created;
              })
            }
          />
        </>
      ) : null}
      {operator ? (
        <>
          <AppText color="textSecondary">
            {text("المواقف المرتبطة", "Linked locations")}: {operator.zoneCount}{" "}
            · {text(...roleNames[operator.memberRole])}
          </AppText>
          {operator.canManageStaff ? (
            <>
              <SectionTitle
                title={text("الفريق والصلاحيات", "Team and access")}
                body={text(
                  "المالك يدير الفريق والمواقف. المدير يدير التشغيل والأسعار. موظف البوابة يدير الدخول والإشغال. تعيين المالك للأدمن فقط.",
                  "Owners manage staff and locations. Managers operate locations and prices. Attendants manage check-in and occupancy. Only administrators assign owners.",
                )}
              />
              {operator.members.length === 0 ? (
                <InlineNotice
                  title={text("لم يُعيّن فريق بعد", "No team assigned")}
                  body={text(
                    "ابحث عن حساب مسجّل ثم أضفه بالصلاحية المناسبة.",
                    "Find an existing account and assign its organization role.",
                  )}
                />
              ) : (
                operator.members.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    isAdmin={isAdmin}
                    busy={command.isPending}
                    onSave={(next) =>
                      run(() =>
                        service.member(operator.id, member.userId, next),
                      )
                    }
                    onRemove={() => setConfirm(member.userId)}
                  />
                ))
              )}
              <SectionTitle
                title={text(
                  "إضافة عضو من حساب موجود",
                  "Add an existing account",
                )}
              />
              <TextField
                label={text(
                  "البريد الكامل أو الهاتف أو معرّف الحساب",
                  "Exact email, phone or account ID",
                )}
                autoCapitalize="none"
                value={search}
                onChangeText={setSearch}
              />
              <AppButton
                label={text("بحث عن الحساب", "Find account")}
                variant="secondary"
                disabled={search.trim().length < 3}
                loading={lookup.isPending}
                onPress={() => lookup.mutate()}
              />
              {lookup.isSuccess && lookup.data.length === 0 ? (
                <AppText color="textSecondary">
                  {text(
                    "لم يُعثر على حساب مطابق. يجب أن يسجل الموظف أولاً.",
                    "No matching account. The employee must register first.",
                  )}
                </AppText>
              ) : null}
              {lookup.data?.length ? (
                <>
                  <Segmented
                    value={role}
                    onChange={setRole}
                    options={(isAdmin
                      ? ["owner", "manager", "attendant"]
                      : ["manager", "attendant"]
                    ).map((value) => ({
                      value: value as MemberRole,
                      label: text(...roleNames[value as MemberRole]),
                    }))}
                  />
                  {lookup.data.map((person) => (
                    <Card key={person.id} tone="sunken" style={stack}>
                      <AppText variant="title">
                        {person.fullName || person.email || person.phone}
                      </AppText>
                      <AppText variant="caption">
                        {person.email ?? person.phone ?? person.id}
                      </AppText>
                      <AppButton
                        label={text(
                          "تعيين الصلاحية المختارة",
                          "Assign selected role",
                        )}
                        size="sm"
                        disabled={person.status !== "ACTIVE"}
                        loading={command.isPending}
                        onPress={() =>
                          run(() =>
                            service.member(operator.id, person.id, role),
                          )
                        }
                      />
                    </Card>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <InlineNotice
              title={text(
                "إدارة الفريق للمالك",
                "Staff management belongs to the owner",
              )}
              body={text(
                "تواصل مع مالك المؤسسة لتعديل صلاحيات الفريق.",
                "Contact the organization owner to change team access.",
              )}
            />
          )}
          {isAdmin && operator.zoneCount === 0 ? (
            <AppButton
              label={text("إزالة المؤسسة الفارغة", "Remove empty organization")}
              variant="danger"
              onPress={() => setConfirm("organization")}
            />
          ) : null}
          {confirm ? (
            <Card tone="sunken" style={stack}>
              <AppText>
                {confirm === "organization"
                  ? text(
                      "إزالة المؤسسة التي لا ترتبط بمواقف وإلغاء عضوياتها؟",
                      "Remove this organization without parking locations and revoke its memberships?",
                    )
                  : text(
                      "تأكيد إزالة العضوية؟ سيتوقف وصول هذا الحساب إلى مواقف المؤسسة.",
                      "Remove this membership? This account will lose access to the organization’s locations.",
                    )}
              </AppText>
              <AppButton
                label={text("تأكيد الإزالة", "Confirm removal")}
                loading={command.isPending}
                variant="danger"
                onPress={() =>
                  run(async () => {
                    if (confirm === "organization") {
                      await service.removeOperator(operator.id);
                      onClose();
                    } else await service.removeMember(operator.id, confirm);
                  })
                }
              />
              <AppButton
                label={text("إلغاء", "Cancel")}
                variant="ghost"
                onPress={() => setConfirm(null)}
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
