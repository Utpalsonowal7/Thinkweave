-- Existing opaque session cookies cannot be used as refresh tokens; users log in again.
UPDATE "Session" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
CREATE TABLE "RefreshToken" (
  "id" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
