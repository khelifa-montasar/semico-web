# Zone and sensor history

Dashboard and Technical Diagnostics share the same 24-hour details dialog. Click a zone or a
registered sensor on the map, use Enter/Space while its marker is focused, or expand **Browse
zones and sensors** below the map. The diagnostics zone buttons open the same dialog.

The window shows the latest recorded soil moisture, sensor battery levels and report times,
the latest confirmed watering, hourly moisture averages over a rolling 24-hour window, and
warnings recorded during that window. It refreshes every 30 seconds and on telemetry/alert
WebSocket updates. Escape, the close button, and clicking the backdrop dismiss it. Labels
support English/Arabic, RTL, and the application's light/dark themes.

## Data semantics

- Empty hours are gaps, not zero readings. A real zero-percent moisture or battery value is shown.
- Watering requires an `OPEN` irrigation command with `status=EXECUTED` and an execution time.
  Pending, failed, cancelled, and receipt-only commands are not watering. An older confirmed
  watering is dated and explicitly marked as preceding the displayed 24-hour period.
- Sensor battery values come from the selected sensor, not the farm controller. Zone views show
  the average of available latest sensor battery reports, with individual sensor values listed.
- Existing telemetry has no sensor identity. It remains available as zone history. A sensor
  with no attributed moisture measurements shows an explicit **zone context** notice; it does
  not claim other zone readings as measurements from that sensor.
- New MQTT samples with a server-configured `sensorKey` retain their sensor ID and zone. Device
  payloads cannot choose a farm, zone, or sensor identity. Configure the device's mapping in
  `MQTT_DEVICE_REGISTRY`; no firmware payload changes are required.
- New moisture-below-18% and battery-below-20% transitions are stored in `ErrorLog` together with
  the reading. Duplicate messages and continuing low readings do not create duplicate warnings.
  Earlier unrecorded alert notifications cannot be recovered retroactively.
- Warning history includes the selected sensor's warnings, applicable zone warnings, and farm-wide
  warnings. At most the latest 100 are returned, with the full matching count displayed.

## API

- `GET /api/v1/farms/me/zones/:zoneId/history`
- `GET /api/v1/farms/me/sensors/:sensorId/history`

Both endpoints require active farm membership, not valve-control permission. Resource IDs are
resolved inside the authorized farm; missing and foreign resources return 404. The owner farm
selector is respected. Super admins cannot use these farm-member endpoints.

Queries capture their farm header and are cached by user, farm, target type, and target ID.
Changing the account or active farm closes the dialog rather than retaining another scope's data.

## Deployment

The additive `20261105150000_sensor_telemetry_history` migration adds a nullable telemetry sensor
reference and an index. Existing rows are not rewritten or removed. On another environment run:

```bash
npm --workspace server run db:deploy
npm --workspace server run db:generate
npm run build
```

Restart the backend to load the regenerated Prisma client. Do not reset or reseed the database.
