-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Farm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerCode" TEXT NOT NULL,
    "wilayaId" TEXT,
    "commune" TEXT,
    "landAreaHa" REAL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Farm_wilayaId_fkey" FOREIGN KEY ("wilayaId") REFERENCES "Wilaya" ("code") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Farm_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Farm" ("commune", "createdAt", "id", "landAreaHa", "name", "ownerCode", "ownerId", "updatedAt", "wilayaId") SELECT "commune", "createdAt", "id", "landAreaHa", "name", "ownerCode", "ownerId", "updatedAt", "wilayaId" FROM "Farm";
DROP TABLE "Farm";
ALTER TABLE "new_Farm" RENAME TO "Farm";
CREATE UNIQUE INDEX "Farm_ownerCode_key" ON "Farm"("ownerCode");
CREATE UNIQUE INDEX "Farm_ownerId_key" ON "Farm"("ownerId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "workerType" TEXT,
    "valveControl" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "wilayaId" TEXT,
    "commune" TEXT,
    "farmId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_wilayaId_fkey" FOREIGN KEY ("wilayaId") REFERENCES "Wilaya" ("code") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarUrl", "bio", "commune", "createdAt", "email", "farmId", "fullName", "id", "passwordHash", "phone", "role", "status", "updatedAt", "valveControl", "wilayaId", "workerType") SELECT "avatarUrl", "bio", "commune", "createdAt", "email", "farmId", "fullName", "id", "passwordHash", "phone", "role", "status", "updatedAt", "valveControl", "wilayaId", "workerType" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_farmId_idx" ON "User"("farmId");
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
