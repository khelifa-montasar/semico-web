-- V2 Phase 2: zone-scoped sensors, and a location on each error log.
--
-- Sensors are their own entity rather than SystemComponent rows: a farm has dozens of them,
-- they belong to a zone, and System Health groups them that way. ErrorLog gains the zone (and
-- optionally the sensor) so the log can say WHERE a fault happened; SetNull so the entry
-- survives the deletion of the zone it names.

-- CreateTable
CREATE TABLE "Sensor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "connection" TEXT NOT NULL DEFAULT 'ONLINE',
    "lastSeenAt" DATETIME NOT NULL,
    "batteryPct" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Sensor_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Sensor_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ErrorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "component" TEXT NOT NULL,
    "messageEn" TEXT NOT NULL,
    "messageAr" TEXT NOT NULL,
    "actionEn" TEXT,
    "actionAr" TEXT,
    "zoneId" TEXT,
    "sensorKey" TEXT,
    CONSTRAINT "ErrorLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ErrorLog_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ErrorLog" ("actionAr", "actionEn", "component", "farmId", "id", "messageAr", "messageEn", "occurredAt") SELECT "actionAr", "actionEn", "component", "farmId", "id", "messageAr", "messageEn", "occurredAt" FROM "ErrorLog";
DROP TABLE "ErrorLog";
ALTER TABLE "new_ErrorLog" RENAME TO "ErrorLog";
CREATE INDEX "ErrorLog_farmId_occurredAt_idx" ON "ErrorLog"("farmId", "occurredAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Sensor_farmId_zoneId_idx" ON "Sensor"("farmId", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Sensor_farmId_key_key" ON "Sensor"("farmId", "key");

