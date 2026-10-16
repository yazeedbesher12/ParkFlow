import { z } from "zod";
import {
  route,
  empty,
  actor,
  param,
  operators,
  admins,
} from "../../apiRegistry";
import * as service from "./service";
import * as schemas from "./schemas";
route(
  "get",
  "/management/zones",
  empty,
  (r) => service.listZones(actor(r)),
  operators,
);
route(
  "get",
  "/management/zones/:id",
  empty,
  (r) => service.getZone(actor(r), param(r)),
  operators,
);
route(
  "post",
  "/management/zones",
  schemas.zoneCreateSchema,
  (r, b) => service.createZone(actor(r), b),
  operators,
);
route(
  "patch",
  "/management/zones/:id",
  schemas.zonePatchSchema,
  (r, b) => service.patchZone(actor(r), param(r), b),
  operators,
);
route(
  "post",
  "/management/zones/:id/lifecycle",
  schemas.lifecycleSchema,
  (r, b) => service.lifecycle(actor(r), param(r), b),
  operators,
);
route(
  "post",
  "/management/zones/:id/tariffs",
  schemas.tariffSchema,
  (r, b) => service.tariff(actor(r), param(r), b),
  operators,
);
route(
  "patch",
  "/management/zones/:id/hours",
  schemas.hoursSchema,
  (r, b) => service.hours(actor(r), param(r), b),
  operators,
);
route(
  "post",
  "/management/zones/:id/closures",
  schemas.closureSchema,
  (r, b) => service.addClosure(actor(r), param(r), b),
  operators,
);
route(
  "delete",
  "/management/zones/:id/closures/:closureId",
  schemas.versionSchema,
  (r, b) =>
    service.removeClosure(
      actor(r),
      param(r),
      param(r, "closureId"),
      b.expectedVersion,
    ),
  operators,
);
route(
  "get",
  "/management/operators",
  empty,
  (r) => service.listOperators(actor(r)),
  operators,
);
route(
  "post",
  "/management/operators",
  schemas.operatorSchema,
  (r, b) => service.createOperator(actor(r), b),
  admins,
);
route(
  "patch",
  "/management/operators/:id",
  schemas.operatorSchema,
  (r, b) => service.updateOperator(actor(r), param(r), b),
  admins,
);
route(
  "delete",
  "/management/operators/:id",
  empty,
  (r) => service.removeOperator(actor(r), param(r)),
  admins,
);
route(
  "get",
  "/management/operators/:id/users",
  z.object({ query: z.string().trim().min(3).max(254) }).strict(),
  (r, b) => service.findPeople(actor(r), param(r), b.query),
  operators,
);
route(
  "post",
  "/management/operators/:id/members",
  schemas.memberSchema,
  (r, b) => service.assignMember(actor(r), param(r), b),
  operators,
);
route(
  "delete",
  "/management/operators/:id/members/:userId",
  empty,
  (r) => service.removeMember(actor(r), param(r), param(r, "userId")),
  operators,
);
