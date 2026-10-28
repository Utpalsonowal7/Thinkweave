CREATE TYPE "AuthActionType" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');
CREATE TABLE "AuthActionToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "AuthActionType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthActionToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthActionToken_tokenHash_key" ON "AuthActionToken"("tokenHash");
CREATE INDEX "AuthActionToken_userId_type_idx" ON "AuthActionToken"("userId", "type");
CREATE INDEX "AuthActionToken_expiresAt_idx" ON "AuthActionToken"("expiresAt");
ALTER TABLE "AuthActionToken" ADD CONSTRAINT "AuthActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
