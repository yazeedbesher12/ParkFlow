ALTER TABLE "user_vehicles" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "user_vehicles" ALTER COLUMN "role" SET DEFAULT 'driver';
ALTER TABLE "operator_users" ADD COLUMN "memberRole" TEXT NOT NULL DEFAULT 'manager';
ALTER TABLE "operator_users" ADD CONSTRAINT "operator_member_role_check" CHECK ("memberRole" IN ('owner','manager','attendant'));
ALTER TABLE "parking_zones" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "parking_zones" ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'published';
ALTER TABLE "parking_zones" ADD COLUMN "metadata" JSONB;
UPDATE "parking_zones" SET "lifecycle" = 'suspended' WHERE "active" = false;
ALTER TABLE "parking_zones" ADD CONSTRAINT "zone_lifecycle_check" CHECK ("lifecycle" IN ('draft','review','published','suspended','archived'));
CREATE TABLE "parking_closures" (
 "id" TEXT NOT NULL, "zoneId" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL,
 "endsAt" TIMESTAMP(3) NOT NULL, "reason" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "parking_closures_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "parking_closure_interval_check" CHECK ("endsAt" > "startsAt"),
 CONSTRAINT "parking_closures_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "parking_closures_zoneId_startsAt_endsAt_idx" ON "parking_closures"("zoneId","startsAt","endsAt");
CREATE TABLE "app_config_revisions" (
 "id" TEXT NOT NULL, "version" INTEGER NOT NULL, "payload" JSONB NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "publishedAt" TIMESTAMP(3), "publication" JSONB,
 CONSTRAINT "app_config_revisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "app_config_revisions_version_key" ON "app_config_revisions"("version");
CREATE TABLE "app_config_state" (
 "id" TEXT NOT NULL DEFAULT 'global', "publishedRevisionId" TEXT, "draftRevisionId" TEXT,
 "version" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "app_config_state_pkey" PRIMARY KEY ("id")
);
