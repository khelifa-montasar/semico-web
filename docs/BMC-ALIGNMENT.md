# BMC Alignment — V3 Technical Diagnostics and Real-Time Alerts

Semico V3 connects its Business Model Canvas objectives to backend-driven farm monitoring,
technical diagnostics, and real-time alerts. The active Technical Diagnostics page uses the
selected farm's persisted data; demonstration readings can originate from the ESP32 simulator.

## Business objectives and implementation

| BMC objective | V3 contribution |
|---|---|
| **Économie d'eau 50 %** | Moisture monitoring, irrigation records, rainfall comparisons, and estimated savings support water-efficient decisions. The 50 % figure remains a business target requiring field validation. |
| **+35 % productivité** | Zone monitoring and timely fault detection support crop management. The 35 % figure remains a business objective, not a measured result of this demonstration. |
| **Sécurité hydrique** | Moisture-coloured zones and an immediate red Dashboard banner identify low moisture and lost gateway communication. |
| **Agriculture durable** | Current weather and baseline-versus-rainfall analytics help users assess irrigation needs; rainfall scenarios are modelled. |
| **Support technique direct** | Owners and engineers can inspect sensor connectivity, battery, gateway, controller, and zone measurements through Technical Diagnostics. |
| **Formation gratuite** | The standalone ESP32 simulator provides a hardware-free demonstration of telemetry, alerts, and valve-command receipts. |

## User interface and technical metrics

The Dashboard and Technical Diagnostics share a farm map with boundaries, coordinates,
moisture-coloured zones, sensor connectivity, and configurable layout slots. Pan and zoom persist
between pages and remain isolated by farm. Planned slots do not represent reporting devices.

| Diagnostic group | Displayed information |
|---|---|
| Sensors | Online count against registered sensors; average available battery readings |
| Gateway | Connectivity, reported uptime, and radio signal strength |
| Controller | Connectivity and firmware version |
| Measurements | Flow rate, soil temperature, latest reading time, zone moisture, and valve state |

Unavailable measurements display `—`. The diagnostics route, `/dashboard/diagnostics`, is offered
to active owners and ENGINEER workers; operators are redirected to the Dashboard. Backend access
remains authenticated and farm-scoped.

## MQTT and WebSocket architecture

Devices publish on `semico/v1/devices/{deviceId}/telemetry`. The existing API gateway validates
payloads, resolves server-owned farm/device mappings, and persists readings before publishing
native WebSocket events. UUID message IDs prevent duplicate storage under MQTT QoS 1.

Authenticated browsers obtain short-lived, single-use tickets bound to an authorized farm.
`telemetry.updated` and `device-status.updated` refresh existing REST queries; `alert.updated`
writes a full alert snapshot directly to the shared TanStack Query cache. The red banner updates
without a page refresh. Latest alert snapshots replay on reconnect, and REST polling remains
available as a fallback.

## Real-time alerts

| Alert | Trigger | Dashboard response |
|---|---|---|
| `MOISTURE_LOW` | Accepted root-moisture reading below 18 % | Immediately activates or updates the red banner |
| `GATEWAY_OFFLINE` | Previously reporting gateway silent for 120 seconds by default | Updates the banner when the server's periodic monitor detects the timeout |

Recovery publishes a replacement snapshot; an empty snapshot clears these alerts immediately.
Existing red diagnostic components and an offline controller also contribute to the banner.
The banner links to System Health. Alert snapshots are held in memory and rebuilt from incoming
telemetry after an API restart.

## Valve commands and demonstration

The Dashboard sends authenticated REST commands. The API routes them to the mapped controller's
`semico/v1/devices/{deviceId}/commands/valve` topic; acknowledgments return on
`semico/v1/devices/{deviceId}/acks/valve` and are correlated by command ID.

The Node.js simulator publishes configurable fake telemetry and prints `ESP32 received: OPEN valve`.
Its `RECEIVED` acknowledgment records receipt while leaving the command `PENDING`. Only a valid
`EXECUTED` acknowledgment updates the valve state; `FAILED` records failure without changing it.
Commands without a receipt fail after 30 seconds. Duplicate and mismatched acknowledgments are
handled without repeated state changes.

## Evidence and interpretation

The V3 verification run passed **411 server tests and 240 client tests: 651 tests with zero failures**,
plus typecheck across all workspaces. A live Mosquitto check verified telemetry, command reception,
receipt acknowledgments, and duplicate suppression.

Simulator telemetry is synthetic; current weather comes from Open-Meteo. Savings estimates and
rainfall scenarios are modelled, and productivity improvements require field evidence. The live
demonstration establishes messaging functionality, not physical valve execution or measured
agricultural gains.

See [MQTT contracts and graduation demo commands](realtime-mqtt.md) for the reproducible workflow.
