import { db, type Tx } from "../../database/client";
import { assert, requireValue } from "../../utils/errors";
import type { Actor } from "../admin/service";

export type ManagementAction =
  "read" | "operate" | "edit" | "staff" | "finance" | "create";
export async function operatorPermission(
  tx: Tx | typeof db,
  actor: Actor,
  operatorId: string,
  action: ManagementAction = "read",
) {
  if (actor.role === "ADMIN") return "admin" as const;
  assert(
    actor.role === "PARKING_OPERATOR",
    "FORBIDDEN",
    "Operator access is required",
    403,
  );
  const member = await tx.operatorUser.findUnique({
    where: { operatorId_userId: { operatorId, userId: actor.userId } },
  });
  assert(
    member && ["owner", "manager", "attendant"].includes(member.memberRole),
    "FORBIDDEN",
    "You do not manage this organization",
    403,
  );
  const allowed =
    member.memberRole === "owner" ||
    (member.memberRole === "manager" &&
      !["staff", "create"].includes(action)) ||
    (member.memberRole === "attendant" && ["read", "operate"].includes(action));
  assert(
    allowed,
    "FORBIDDEN",
    "Your organization role does not permit this action",
    403,
  );
  return member.memberRole as "owner" | "manager" | "attendant";
}
export async function zonePermission(
  tx: Tx | typeof db,
  actor: Actor,
  zoneId: string,
  action: ManagementAction = "edit",
) {
  const zone = requireValue(
    await tx.parkingZone.findUnique({ where: { id: zoneId } }),
  );
  await operatorPermission(tx, actor, zone.operatorId, action);
  return zone;
}
