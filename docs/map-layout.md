# Configured zones, sensors, and extents

## Using Settings

1. Sign in as the farm owner and open **Settings**.
2. Set **Number of zones** and **Sensors per zone**, then press **Save layout**.
   The total is zones multiplied by sensors per zone: `1 × 1` produces one zone with one sensor.
3. Under **Farm zones**, choose **Zone size and extent** for a zone.
4. Pan the editor to the desired location, enter width/height in metres, and press
   **Apply rectangle at map center**. Alternatively, clear the shape and click its corners.
5. Press **Save shape**. Both Dashboard and Technical Diagnostics use the stored polygon and
   refit the map after layout changes. **Use automatic grid** removes the custom extent.

Rectangle controls accept dimensions from 1 to 20,000 metres. Custom zone polygons allow
3–64 distinct, non-crossing corners. Sensor dots are schematic layout positions inside the
zone, not GPS measurements. Panning/zooming remains shared between the two farm maps when
the saved layout has not changed.

## History and hardware safety

- Saving counts reconciles actual configured zone/sensor records. Excess records are deactivated,
  not deleted. Increasing counts reuses those IDs, keys, geometry, and history before creating new records.
- New sensors are offline, with unknown battery and no last-report timestamp until they send telemetry.
  Layout changes do not provision physical hardware or modify MQTT broker/device credentials.
- Use the sensor keys shown by the platform in the server-owned `MQTT_DEVICE_REGISTRY` mappings.
  Deactivated zones/sensors cannot receive new telemetry or valve-control requests.
- A zone with an open valve or a pending irrigation command cannot be removed from the configured
  layout. The settings change is rejected atomically; close/resolve irrigation first.
- Existing 24-hour history remains available when a deactivated sensor/zone is re-enabled.
- Zone geometry does not change the farm profile's location or the weather coordinates.

For legacy layouts created before this feature, save the desired counts once to reconcile their
registered records. Map rendering respects the saved counts even while old query data is refetching.

## Deployment

```bash
npm --workspace server run db:deploy
npm --workspace server run db:generate
npm run build
```

The `20261109150000_configured_zone_layout` migration preserves existing rows and sensor-history
references. It adds configured flags and zone boundaries, and permits unknown sensor report times.
Restart the backend after regenerating Prisma. Do not reset or reseed the database.
