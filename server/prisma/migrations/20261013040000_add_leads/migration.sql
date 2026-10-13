-- Adds the sales-lead table.
--
-- The public lead-capture form on the Services page previously collected a name, email, phone and
-- land area, advanced to a thank-you step promising contact within 24 hours, and persisted nothing.
-- This gives it somewhere to write.
--
-- Purely additive: a new table, no changes to existing ones, so no backfill is needed.

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "landArea" TEXT,
    "locale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
