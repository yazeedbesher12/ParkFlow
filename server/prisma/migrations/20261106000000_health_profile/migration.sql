ALTER TABLE "users" ADD COLUMN "healthProfileCompletedAt" TIMESTAMP(3);

CREATE TABLE "HealthProfile" (
    "userId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthProfile_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "HealthProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
