-- Roles are stored as strings; SUPER_ADMIN requires no column alteration.
ALTER TABLE "Farm" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "featuresJson" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true
);
