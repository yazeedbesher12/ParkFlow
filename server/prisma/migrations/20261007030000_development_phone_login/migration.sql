-- Distinguish new development accounts from unverified legacy phone records.
-- Real OTP verification clears this marker; no verification timestamp is fabricated.
ALTER TABLE "users" ADD COLUMN "phoneVerificationPending" BOOLEAN NOT NULL DEFAULT false;
