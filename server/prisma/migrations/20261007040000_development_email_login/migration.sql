-- Preserve real verification timestamps while recognizing accounts created for development.
ALTER TABLE "users" ADD COLUMN "emailVerificationPending" BOOLEAN NOT NULL DEFAULT false;
