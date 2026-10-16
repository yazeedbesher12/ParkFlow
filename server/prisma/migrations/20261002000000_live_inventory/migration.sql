CREATE TYPE "InventoryMode" AS ENUM ('demo', 'live');
CREATE TYPE "ReservationGuarantee" AS ENUM ('none', 'operator_backed');
CREATE TYPE "InventoryHoldStatus" AS ENUM ('active', 'released', 'expired', 'consumed');

ALTER TABLE "parking_zones" ADD COLUMN "inventoryMode" "InventoryMode" NOT NULL DEFAULT 'demo';
ALTER TABLE "parking_zones" ADD COLUMN "inventoryProvider" TEXT;
ALTER TABLE "parking_reservations" ADD COLUMN "inventoryMode" "InventoryMode" NOT NULL DEFAULT 'demo';
ALTER TABLE "parking_reservations" ADD COLUMN "guarantee" "ReservationGuarantee" NOT NULL DEFAULT 'none';
ALTER TABLE "parking_reservations" ADD COLUMN "holdId" TEXT;
ALTER TABLE "parking_reservations" ADD COLUMN "holdExpiresAt" TIMESTAMP(3);

CREATE TABLE "inventory_holds" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "spotId" TEXT NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "holdKey" TEXT NOT NULL,
  "status" "InventoryHoldStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_holds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_holds_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_holds_time_check" CHECK ("endTime" > "startTime")
);
CREATE UNIQUE INDEX "inventory_holds_holdKey_key" ON "inventory_holds"("holdKey");
CREATE INDEX "inventory_holds_zoneId_spotId_startTime_endTime_idx" ON "inventory_holds"("zoneId", "spotId", "startTime", "endTime");
CREATE INDEX "inventory_holds_status_expiresAt_idx" ON "inventory_holds"("status", "expiresAt");
CREATE UNIQUE INDEX "parking_reservations_holdId_key" ON "parking_reservations"("holdId");
ALTER TABLE "parking_reservations" ADD CONSTRAINT "parking_reservations_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "inventory_holds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
