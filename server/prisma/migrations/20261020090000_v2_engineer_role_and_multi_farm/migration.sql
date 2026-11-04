-- V2 Phase 1: rename the OBSERVER worker type to ENGINEER, and allow an owner to hold up to
-- three farms.
--
-- The role rename is a DATA migration as well as a type change: existing rows carry the literal
-- 'OBSERVER', and the API validates workerType against the new tuple, so leaving them unmigrated
-- would reject every existing observer on their next request.

-- 1. Rename existing observer rows. The FROM value must stay 'OBSERVER' — it is a historical
--    database value, not a current type name.
UPDATE "User" SET "workerType" = 'ENGINEER' WHERE "workerType" = 'OBSERVER';

-- 2. An owner may now own several farms, so the one-to-one constraint on Farm.ownerId goes. The
--    index stays: "every farm of this owner" is the query requireAuth runs on each request.
DROP INDEX "Farm_ownerId_key";

CREATE INDEX "Farm_ownerId_idx" ON "Farm"("ownerId");
