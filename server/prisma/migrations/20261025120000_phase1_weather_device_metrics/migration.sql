-- Phase 1: store farm coordinates for location-aware services and current gateway/device metrics.
ALTER TABLE "Farm" ADD COLUMN "latitude" REAL;
ALTER TABLE "Farm" ADD COLUMN "longitude" REAL;
ALTER TABLE "DeviceStatus" ADD COLUMN "loraGatewayOnline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeviceStatus" ADD COLUMN "loraUptimeMinutes" INTEGER;
ALTER TABLE "DeviceStatus" ADD COLUMN "flowRateLpm" REAL;
