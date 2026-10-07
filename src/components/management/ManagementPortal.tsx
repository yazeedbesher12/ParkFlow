import { useState } from "react";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Segmented,
  StatusBadge,
  TextField,
} from "@/components/ui";
import { managementService as service } from "@/services/http/managementService";
import { useAuthStore } from "@/store/authStore";
import { spacing } from "@/theme/spacing";
import type { ManagementZone, ZoneLifecycle } from "@/types/management";
import { lifecycleNames, roleNames, useManagementText } from "./shared";
import { ZoneEditor } from "./ZoneEditor";
import { OperatorEditor } from "./OperatorEditor";

export function ManagementPortal({ admin = false }: { admin?: boolean }) {
  const text = useManagementText();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const allowed = admin
    ? isAdmin
    : isAdmin || user?.role === "PARKING_OPERATOR";
  const [tab, setTab] = useState<"zones" | "organizations">("zones");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ZoneLifecycle | "all">("all");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [zoneOverride, setZoneOverride] = useState<ManagementZone | null>(null);
  const zones = useQuery({
    queryKey: ["management", "zones"],
    queryFn: service.zones,
    enabled: allowed,
  });
  const operators = useQuery({
    queryKey: ["management", "operators"],
    queryFn: service.operators,
    enabled: allowed,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["management"] });
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
    void queryClient.invalidateQueries({ queryKey: ["operator"] });
    void queryClient.invalidateQueries({ queryKey: ["zones"] });
  };
  const selectedZone =
    zoneOverride?.id === zoneId
      ? zoneOverride
      : zones.data?.find((z) => z.id === zoneId);
  const selectedOperator = operators.data?.find((o) => o.id === operatorId);
  const reload = () => {
    setZoneOverride(null);
    void zones.refetch();
  };
  const saved = (zone: ManagementZone) => {
    setZoneId(zone.id);
    setZoneOverride(zone);
    refresh();
  };
  if (!allowed)
    return (
      <Screen>
        <ErrorState
          error={
            new Error(
              text(
                "هذه الصفحة مخصصة لإدارة المواقف.",
                "This page requires parking management access.",
              ),
            )
          }
        />
      </Screen>
    );
  const records = (zones.data ?? []).filter(
    (z) =>
      (filter === "all" || z.lifecycle === filter) &&
      `${z.name} ${z.nameAr} ${z.code} ${z.city} ${z.cityAr} ${z.operator.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const canCreate = isAdmin || operators.data?.some((o) => o.canCreateZone);
  return (
    <Screen contentContainerStyle={{ gap: spacing.xl }}>
      <View
        style={{
          width: "100%",
          maxWidth: 1000,
          alignSelf: "center",
          gap: spacing.xl,
        }}
      >
        <AppHeader
          leading="back"
          title={
            admin
              ? text("إدارة المواقف والمؤسسات", "Parking and organizations")
              : text("إدارة مواقفي والفريق", "My locations and team")
          }
          subtitle={text(
            "الموقع والأسعار والدوام والصلاحيات في مكان واحد.",
            "Locations, pricing, hours and staff access in one place.",
          )}
          trailing={
            <AppButton
              label={text("تحديث", "Refresh")}
              size="sm"
              fullWidth={false}
              variant="secondary"
              loading={zones.isFetching || operators.isFetching}
              onPress={() => {
                setZoneOverride(null);
                refresh();
              }}
            />
          }
        />
        {zones.error || operators.error ? (
          <ErrorState
            error={zones.error ?? operators.error}
            onRetry={refresh}
          />
        ) : null}
        {zoneId !== null ? (
          <ZoneEditor
            key={zoneId}
            zone={selectedZone}
            operators={operators.data ?? []}
            isAdmin={isAdmin}
            onSaved={saved}
            onClose={() => {
              setZoneId(null);
              setZoneOverride(null);
            }}
            onReload={reload}
          />
        ) : operatorId !== null ? (
          <OperatorEditor
            key={operatorId}
            operator={selectedOperator}
            isAdmin={isAdmin}
            onChanged={refresh}
            onClose={() => setOperatorId(null)}
          />
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.md,
              }}
            >
              {(
                [
                  {
                    value: zones.data?.length ?? 0,
                    label: text("المواقف", "Locations"),
                  },
                  {
                    value:
                      zones.data?.filter((z) => z.lifecycle === "published")
                        .length ?? 0,
                    label: text("منشور", "Published"),
                  },
                  {
                    value:
                      zones.data?.filter((z) => z.lifecycle === "review")
                        .length ?? 0,
                    label: text("للمراجعة", "Awaiting review"),
                  },
                ] as const
              ).map((stat, i) => (
                <Card
                  key={i}
                  tone={i === 2 ? "brand" : "plain"}
                  style={{ flex: 1, minWidth: 130, gap: spacing.sm }}
                >
                  <AppText variant="h2" numeric>
                    {stat.value}
                  </AppText>
                  <AppText color="textSecondary">{stat.label}</AppText>
                </Card>
              ))}
            </View>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "zones", label: text("المواقف", "Parking locations") },
                {
                  value: "organizations",
                  label: text("المؤسسات والفريق", "Organizations and team"),
                },
              ]}
            />
            {tab === "zones" ? (
              <View style={{ gap: spacing.lg }}>
                {canCreate ? (
                  <AppButton
                    label={text("إضافة موقف جديد", "Add a parking location")}
                    disabled={!operators.data?.length}
                    onPress={() => {
                      setZoneOverride(null);
                      setZoneId("new");
                    }}
                  />
                ) : null}
                {isAdmin && operators.data?.length === 0 ? (
                  <AppText color="textSecondary">
                    {text(
                      "أضف مؤسسة أولاً ثم أضف مواقفها.",
                      "Create an organization first, then add its locations.",
                    )}
                  </AppText>
                ) : null}
                <TextField
                  label={text(
                    "ابحث بالاسم أو المدينة أو الرمز",
                    "Search by name, city or code",
                  )}
                  value={search}
                  onChangeText={setSearch}
                />
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: text("الكل", "All") },
                    ...(
                      [
                        "draft",
                        "review",
                        "published",
                        "suspended",
                        "archived",
                      ] as ZoneLifecycle[]
                    ).map((value) => ({
                      value,
                      label: text(...lifecycleNames[value]),
                    })),
                  ]}
                />
                {zones.isPending ? (
                  <AppText>
                    {text("جارٍ تحميل المواقف…", "Loading locations…")}
                  </AppText>
                ) : records.length === 0 ? (
                  <EmptyState
                    title={text(
                      "لا توجد مواقف مطابقة",
                      "No matching locations",
                    )}
                    body={text(
                      "أضف موقفاً أو غيّر خيارات البحث.",
                      "Add a location or adjust your search.",
                    )}
                  />
                ) : (
                  records.map((zone) => (
                    <Card
                      key={zone.id}
                      padding="lg"
                      style={{ gap: spacing.md }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          gap: spacing.md,
                          alignItems: "center",
                        }}
                      >
                        <View style={{ flex: 1, gap: spacing.xs }}>
                          <AppText variant="h3">
                            {text(zone.nameAr, zone.name)}
                          </AppText>
                          <AppText color="textSecondary">
                            {zone.code} · {text(zone.cityAr, zone.city)} ·{" "}
                            {zone.operator.name}
                          </AppText>
                        </View>
                        <StatusBadge
                          label={text(...lifecycleNames[zone.lifecycle])}
                          tone={zone.active ? "success" : "neutral"}
                        />
                      </View>
                      <AppText variant="caption" color="textSecondary">
                        {text("السعة", "Capacity")}: {zone.capacity ?? "—"} ·{" "}
                        {text(...roleNames[zone.memberRole])} ·{" "}
                        {text("إصدار", "Version")} {zone.version}
                      </AppText>
                      <AppButton
                        label={
                          zone.canEdit
                            ? text("إدارة الموقف", "Manage location")
                            : text("عرض البيانات", "View location")
                        }
                        variant="secondary"
                        onPress={() => {
                          setZoneOverride(null);
                          setZoneId(zone.id);
                        }}
                      />
                    </Card>
                  ))
                )}
              </View>
            ) : (
              <View style={{ gap: spacing.lg }}>
                {isAdmin ? (
                  <AppButton
                    label={text(
                      "إضافة مؤسسة / صاحب مواقف",
                      "Add an organization",
                    )}
                    onPress={() => setOperatorId("new")}
                  />
                ) : null}
                {operators.data?.map((operator) => (
                  <Card
                    key={operator.id}
                    padding="lg"
                    style={{ gap: spacing.md }}
                  >
                    <AppText variant="h3">{operator.name}</AppText>
                    <AppText color="textSecondary">
                      {text("المواقف", "Locations")}: {operator.zoneCount} ·{" "}
                      {text(...roleNames[operator.memberRole])}
                    </AppText>
                    <AppButton
                      label={
                        operator.canManageStaff
                          ? text(
                              "إدارة المؤسسة والفريق",
                              "Manage organization and team",
                            )
                          : text("عرض المؤسسة", "View organization")
                      }
                      variant="secondary"
                      onPress={() => setOperatorId(operator.id)}
                    />
                  </Card>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
