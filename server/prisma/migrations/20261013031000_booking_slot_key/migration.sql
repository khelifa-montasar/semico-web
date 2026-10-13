-- Replaces the (day, startTime) unique index with a nullable uniqueness key.
--
-- The old index made a slot permanently unbookable once it had been cancelled: the cancelled row
-- kept occupying the pair. `slotKey` is NULL for cancelled bookings, and SQLite allows many NULLs
-- in a unique index, so a slot is claimed by at most one LIVE booking and released on cancellation.

-- DropIndex
DROP INDEX "Booking_day_startTime_key";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "slotKey" TEXT;

-- Backfill: claim the slot for every booking that is still live.
--
-- The key must match what the application writes — `<UTC date of the stored instant>|<startTime>`.
-- Prisma stores DATETIME in SQLite as integer milliseconds, hence the /1000 + 'unixepoch'. Using
-- the UTC date (not the farm-local one) matches `day.toISOString().slice(0, 10)` in the repository.
--
-- Safe against duplicates: the index being dropped was unique over (day, startTime) across ALL
-- rows, so no two live bookings can already share a slot.
UPDATE "Booking"
SET "slotKey" = date("day" / 1000, 'unixepoch') || '|' || "startTime"
WHERE "status" <> 'CANCELLED';

-- CreateIndex
CREATE UNIQUE INDEX "Booking_slotKey_key" ON "Booking"("slotKey");
