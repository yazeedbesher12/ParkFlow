import { api, query, segment } from "./apiClient";
import type {
  ManagementZone,
  ManagementOperator,
  ManagementPerson,
  ZoneInput,
  ZoneLifecycle,
  ManagementHours,
  TariffInput,
  MemberRole,
} from "@/types/management";
const zone = (id: string) => "/management/zones/" + segment(id);
const operator = (id: string) => "/management/operators/" + segment(id);
export const managementService = {
  zones: () => api<ManagementZone[]>("/management/zones"),
  zone: (id: string) => api<ManagementZone>(zone(id)),
  createZone: (input: ZoneInput) =>
    api<ManagementZone>("/management/zones", { method: "POST", body: input }),
  updateZone: (
    id: string,
    input: Partial<ZoneInput> & { expectedVersion: number },
  ) => api<ManagementZone>(zone(id), { method: "PATCH", body: input }),
  lifecycle: (id: string, expectedVersion: number, lifecycle: ZoneLifecycle) =>
    api<ManagementZone>(zone(id) + "/lifecycle", {
      method: "POST",
      body: { expectedVersion, lifecycle },
    }),
  tariff: (id: string, expectedVersion: number, input: TariffInput) =>
    api<ManagementZone>(zone(id) + "/tariffs", {
      method: "POST",
      body: { expectedVersion, ...input },
    }),
  hours: (id: string, expectedVersion: number, hours: ManagementHours[]) =>
    api<ManagementZone>(zone(id) + "/hours", {
      method: "PATCH",
      body: {
        expectedVersion,
        hours: hours.map(({ weekday, opensAt, closesAt, closed }) => ({
          weekday,
          opensAt,
          closesAt,
          closed,
        })),
      },
    }),
  closure: (
    id: string,
    expectedVersion: number,
    input: { startsAt: string; endsAt: string; reason: string },
  ) =>
    api<ManagementZone>(zone(id) + "/closures", {
      method: "POST",
      body: { expectedVersion, ...input },
    }),
  removeClosure: (id: string, closureId: string, expectedVersion: number) =>
    api<ManagementZone>(zone(id) + "/closures/" + segment(closureId), {
      method: "DELETE",
      body: { expectedVersion },
    }),
  operators: () => api<ManagementOperator[]>("/management/operators"),
  createOperator: (input: { name: string; type: string }) =>
    api<ManagementOperator>("/management/operators", {
      method: "POST",
      body: input,
    }),
  updateOperator: (id: string, input: { name: string; type: string }) =>
    api<ManagementOperator>(operator(id), { method: "PATCH", body: input }),
  removeOperator: (id: string) => api(operator(id), { method: "DELETE" }),
  findPeople: (id: string, value: string) =>
    api<ManagementPerson[]>(operator(id) + "/users" + query({ query: value })),
  member: (id: string, userId: string, memberRole: MemberRole) =>
    api<ManagementOperator>(operator(id) + "/members", {
      method: "POST",
      body: { userId, memberRole },
    }),
  removeMember: (id: string, userId: string) =>
    api<ManagementOperator>(operator(id) + "/members/" + segment(userId), {
      method: "DELETE",
    }),
};
