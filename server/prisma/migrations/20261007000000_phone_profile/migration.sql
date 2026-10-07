ALTER TABLE "users" ADD COLUMN "nationalIdEncrypted" TEXT,
ADD COLUMN "nationalIdLast4" TEXT,
ADD COLUMN "profileCompletedAt" TIMESTAMP(3);

-- Preserve setup state for existing accounts; phone registrations start incomplete.
UPDATE "users" SET "profileCompletedAt" = "updatedAt" WHERE length(trim("fullName")) > 0;
