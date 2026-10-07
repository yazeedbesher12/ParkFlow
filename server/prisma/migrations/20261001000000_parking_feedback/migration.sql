CREATE TYPE "ParkingFeedbackOutcome" AS ENUM ('found', 'not_found', 'delayed');
CREATE TYPE "ParkingFeedbackDelayBucket" AS ENUM ('under_5m', '5_15m', 'over_15m');

CREATE TABLE "parking_feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "sessionId" TEXT,
  "reservationId" TEXT,
  "outcome" "ParkingFeedbackOutcome" NOT NULL,
  "delayBucket" "ParkingFeedbackDelayBucket",
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parking_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parking_feedback_userId_idempotencyKey_key" ON "parking_feedback"("userId", "idempotencyKey");
CREATE INDEX "parking_feedback_zoneId_createdAt_idx" ON "parking_feedback"("zoneId", "createdAt");
CREATE INDEX "parking_feedback_userId_createdAt_idx" ON "parking_feedback"("userId", "createdAt");
CREATE INDEX "parking_feedback_sessionId_idx" ON "parking_feedback"("sessionId");
CREATE INDEX "parking_feedback_reservationId_idx" ON "parking_feedback"("reservationId");

ALTER TABLE "parking_feedback" ADD CONSTRAINT "parking_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parking_feedback" ADD CONSTRAINT "parking_feedback_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parking_feedback" ADD CONSTRAINT "parking_feedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "parking_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "parking_feedback" ADD CONSTRAINT "parking_feedback_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "parking_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;