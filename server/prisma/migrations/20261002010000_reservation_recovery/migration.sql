CREATE TYPE "ReservationResolution" AS ENUM ('none', 'alternative', 'refund_requested');
ALTER TABLE "parking_reservations" ADD COLUMN "checkedInAt" TIMESTAMP(3);
ALTER TABLE "parking_reservations" ADD COLUMN "operatorResolution" "ReservationResolution" NOT NULL DEFAULT 'none';
ALTER TABLE "parking_reservations" ADD COLUMN "operatorResolutionNote" TEXT;
