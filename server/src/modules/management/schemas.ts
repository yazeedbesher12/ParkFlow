import { z } from "zod";
const text = z.string().trim().min(1).max(200);
const money = z.number().int().min(0).max(10000000);
export const versionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const metadataSchema = z
  .object({
    images: z
      .array(
        z
          .url()
          .max(2048)
          .refine((url) => url.startsWith("https://"), "Images must use HTTPS"),
      )
      .max(8)
      .default([]),
    amenities: z
      .array(
        z.enum([
          "accessible",
          "covered",
          "security",
          "ev_charging",
          "restrooms",
        ]),
      )
      .max(5)
      .default([]),
    entrance: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        instructions: z.string().trim().max(1000).optional(),
      })
      .strict()
      .optional(),
    heightLimitMeters: z.number().positive().max(20).optional(),
  })
  .strict();
export const zoneCreateSchema = z
  .object({
    operatorId: text,
    code: text,
    name: text,
    nameAr: text,
    city: text,
    cityAr: text,
    address: z.string().trim().max(300).optional(),
    description: z.string().trim().max(2000).optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    kind: z.enum(["street", "garage", "lot", "private"]),
    capacity: z.number().int().min(1).max(100000),
    defaultMode: z.enum(["start_stop", "prepaid"]),
    supportedModes: z
      .array(z.enum(["start_stop", "prepaid"]))
      .min(1)
      .max(2),
    supportedEntryMethods: z
      .array(z.enum(["gps", "qr", "zone_code", "anpr", "manual"]))
      .min(1)
      .max(5),
    metadata: metadataSchema.optional(),
  })
  .strict();
export const zonePatchSchema = zoneCreateSchema
  .partial()
  .extend(versionSchema.shape)
  .strict();
export const lifecycleSchema = versionSchema
  .extend({
    lifecycle: z.enum([
      "draft",
      "review",
      "published",
      "suspended",
      "archived",
    ]),
  })
  .strict();
export const tariffSchema = versionSchema
  .extend({
    name: text,
    hourlyRate: money,
    incrementMinutes: z.number().int().min(1).max(60),
    freeMinutes: z.number().int().min(0).max(1440),
    minimumCharge: money,
    dailyCap: money.optional(),
    maxStayMinutes: z.number().int().min(15).max(1440).optional(),
    validFrom: z.iso.datetime(),
    validTo: z.iso.datetime().optional(),
  })
  .strict();
export const hourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closed: z.boolean(),
  })
  .strict();
export const hoursSchema = versionSchema
  .extend({
    hours: z
      .array(hourSchema)
      .length(7)
      .refine(
        (rows) => new Set(rows.map((r) => r.weekday)).size === 7,
        "Every weekday is required exactly once",
      ),
  })
  .strict();
export const closureSchema = versionSchema
  .extend({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: text,
  })
  .strict();
export const operatorSchema = z
  .object({
    name: text,
    type: z.enum(["municipality", "mall", "hospital", "garage"]),
  })
  .strict();
export const memberSchema = z
  .object({
    userId: text,
    memberRole: z.enum(["owner", "manager", "attendant"]),
  })
  .strict();
