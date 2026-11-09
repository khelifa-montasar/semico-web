ALTER TABLE "Telemetry" ADD COLUMN "sensorId" TEXT REFERENCES "Sensor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Telemetry_farmId_sensorId_recordedAt_idx" ON "Telemetry"("farmId", "sensorId", "recordedAt");
