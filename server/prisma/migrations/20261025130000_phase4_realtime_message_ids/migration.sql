-- Make QoS 1 telemetry redelivery idempotent per farm.
ALTER TABLE "Telemetry" ADD COLUMN "sourceMessageId" TEXT;
CREATE UNIQUE INDEX "Telemetry_farmId_sourceMessageId_key" ON "Telemetry"("farmId", "sourceMessageId");
