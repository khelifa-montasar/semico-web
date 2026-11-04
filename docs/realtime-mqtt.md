# MQTT telemetry and browser realtime

The API can optionally subscribe to device telemetry over MQTT and forward farm-scoped updates to authenticated browser sessions. REST remains the source of truth and fallback; the MQTT subscriber is disabled when `MQTT_URL` is unset.

## MQTT topic and payload

The subscriber listens at QoS 1 on:

```text
semico/v1/devices/{deviceId}/telemetry
```

`MQTT_TOPIC_PREFIX` can replace the default prefix. Each JSON payload must contain a stable UUID `messageId` and at least one measurement. `recordedAt` is optional ISO 8601 UTC time; absent values use server receive time. Supported optional readings are `rootMoisture` and `surfaceMoisture` (0–100), `soilTempC` (-40–85 °C), `batteryPct` (integer 0–100), `flowRateLpm` (0–10,000), `loraRssi` (-200–0), and `valveState` (`OPEN` or `CLOSED`). Unknown fields—including `farmId`—are rejected. Readings more than 30 days old or 5 minutes in the future are rejected.

Example:

```json
{
  "messageId": "7b8c9d6e-5f4a-4321-9876-1234567890ab",
  "recordedAt": "2026-10-25T12:00:00.000Z",
  "rootMoisture": 42.5,
  "batteryPct": 91,
  "loraRssi": -72
}
```

The server-side `MQTT_DEVICE_REGISTRY` maps each topic device ID to a farm and optional zone/sensor, for example:

```json
{"controller-01":{"farmId":"<farm-id>","zoneId":"<zone-id>","kind":"CONTROLLER"}}
```

Supported `kind` values are `CONTROLLER`, `GATEWAY`, and `SENSOR`. Mappings are configuration-owned; device messages cannot select a farm. The broker must require TLS in production (`mqtts://`), authenticate each physical device, and enforce per-device ACLs so a device can publish only to its mapped topic. The API subscriber credentials should be read-only for that telemetry topic tree and must not be logged. Do not expose broker credentials or a device-management API to the browser.

QoS 1 redelivery is idempotent per farm using the payload `messageId`. The subscriber persists the reading and associated health state before acknowledging the packet; malformed messages are logged and acknowledged/dropped, while transient persistence failures are not acknowledged so the broker can redeliver. Device IDs/topics and parsing errors may appear in logs, but payload contents and credentials do not.

## WebSocket events

Authenticated clients first request `POST /api/v1/farms/me/realtime-ticket` with their normal bearer token and active `X-Farm-Id`. The ticket is random, single-use, expires after 30 seconds, and is bound to the resolved farm. The client then connects to `/api/v1/realtime?ticket=…` from an allowed CORS origin. A socket cannot select or change its farm and receives only:

- `telemetry.updated`: `{ type, farmId, zoneId, recordedAt }`
- `device-status.updated`: `{ type, farmId, updatedAt }`
- `alert.updated`: `{ type, farmId, evaluatedAt, activeAlerts }`, a full snapshot with `MOISTURE_LOW` (root moisture below 18%) and `GATEWAY_OFFLINE` (a previously reporting gateway silent for 120 seconds). Each alert includes `code`, `targetId`, and nullable `zoneId`; an empty array clears resolved alerts.

Browser messages are not accepted. The client writes alert snapshots directly into its farm-scoped TanStack Query cache so the Dashboard's global red banner updates immediately, then refreshes the corresponding REST details. The WebSocket server replays the latest alert snapshot to newly connected/reconnected sessions for their authorized farm. Existing polling continues as a fallback, including moisture and gateway checks before the first alert snapshot arrives. Alert snapshots are held in memory and rebuilt from incoming telemetry after an API restart.

## Valve command and acknowledgment contract

MQTT-backed valve endpoints publish to exactly one trusted controller mapping for the authenticated farm and zone. The browser never supplies a device ID or farm ID for routing. The registry entry must have `kind: "CONTROLLER"`, and both `farmId` and `zoneId` must match the selected farm/zone. Missing or ambiguous mappings fail closed.

With the default `MQTT_TOPIC_PREFIX=semico/v1/devices`:

- Server publishes a valve command to `semico/v1/devices/{deviceId}/commands/valve`.
- The device publishes acknowledgment to `semico/v1/devices/{deviceId}/acks/valve`.
- Both directions use QoS 1; command publishes are non-retained. Receivers must tolerate QoS 1 duplicates using `commandId`.

Command payload (strict JSON; unknown fields are rejected):

```json
{
  "commandId": "cm...",
  "zoneId": "zone-id",
  "action": "OPEN",
  "durationMin": 10,
  "issuedAt": "2026-10-25T12:00:00.000Z"
}
```

`commandId` is the persistent irrigation-command ID. `durationMin` is 1–120 for `OPEN` and `null` for `CLOSE`. Device identity is derived from the MQTT topic, not from the payload.

The simulator sends a receipt acknowledgment only:

```json
{"commandId":"cm...","status":"RECEIVED","receivedAt":"2026-10-25T12:00:01.000Z"}
```

`RECEIVED` confirms that the simulator validated, printed, and accepted the command for the simulator's receipt workflow; it does **not** mean the valve moved. The database stores `acknowledgedAt`, but command status remains `PENDING` and zone state remains unchanged. A real device may send a terminal `EXECUTED` acknowledgment only after its execution/feedback policy confirms success, including the resulting `valveState` and `completedAt`. A terminal `FAILED` acknowledgment includes `completedAt` and a bounded `errorCode`. Only a matching terminal `EXECUTED` ACK updates zone state and marks the command executed; `FAILED` marks the command failed without changing zone state. ACKs must echo the command ID and come from the controller topic mapped to that command's farm and zone. Duplicate, late, malformed, or mismatched ACKs do not change state.

The server fails a command if no device receipt arrives within 30 seconds. It does not automatically retry valve commands. A receipt-acknowledged command remains pending until a terminal device ACK arrives. MQTT PUBACK only proves broker receipt—not device receipt or physical execution. MQTT-backed API commands remain pending until terminal execution; when `MQTT_URL` is unset, the existing immediate simulated API behavior is retained. A durable outbox and recovery of pending commands after server restart are not included in this simulator phase.

## ESP32 simulator

The simulator is a Node process using the same wire contract; it does not control a valve and never sends `EXECUTED`:

```bash
SIMULATOR_MQTT_URL=mqtt://localhost:1883 \
SIMULATOR_DEVICE_ID=controller-01 \
SIMULATOR_MQTT_TOPIC_PREFIX=semico/v1/devices \
npm run esp32:simulator
```

Optional credentials use the paired variables `SIMULATOR_MQTT_USERNAME` and `SIMULATOR_MQTT_PASSWORD`. The URL and prefix fall back to `MQTT_URL` and `MQTT_TOPIC_PREFIX` in `server/.env`; device credentials remain separate. It publishes fake telemetry immediately after subscribing and every five seconds with a fresh UUID `messageId`, subscribes to its device's `/commands/valve` topic, prints each unique valid command, and publishes a correlated `RECEIVED` ACK. `SIMULATOR_ROOT_MOISTURE` defaults to `17.5` (triggering the moisture alert); `SIMULATOR_TELEMETRY_INTERVAL_MS` defaults to `5000`. Example output:

```text
ESP32 connected; listening on semico/v1/devices/controller-01/commands/valve
ESP32 published telemetry: rootMoisture=17.5% on semico/v1/devices/controller-01/telemetry
ESP32 received: OPEN valve
```

For the example device to receive commands, add a matching server-owned mapping in `server/.env`, for example `{"controller-01":{"farmId":"<farm-id>","zoneId":"<zone-id>","kind":"CONTROLLER"}}`.

## Graduation defense: exact local commands

These commands assume dependencies, `server/.env`, migrations, and the demo farm are already set up as in the root README. They use the existing versioned topics and the seeded owner's first zone, which is also the Dashboard irrigation button's default zone. Use your configured broker URL and device credentials if you already have a broker running; in that case skip terminal 1.

Terminal 1 — local broker (requires Mosquitto):

```bash
mosquitto -p 1883 -v
```

Terminal 2 — derive the real demo farm/zone IDs and run the API plus browser app:

```bash
cd /home/khelifa/Desktop/semico-web/server
export MQTT_URL=mqtt://127.0.0.1:1883
export MQTT_TOPIC_PREFIX=semico/v1/devices
MQTT_DEVICE_REGISTRY="$(node --input-type=module -e '
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const farm = await db.farm.findFirst({
    where: { owner: { email: "owner@semico.dz" } },
    include: { zones: { orderBy: { sortOrder: "asc" }, take: 1 } }
  });
  if (!farm?.zones[0]) throw new Error("Seed the demo farm first, or select your own farm/zone mapping.");
  console.log(JSON.stringify({ "controller-01": {
    farmId: farm.id, zoneId: farm.zones[0].id, kind: "CONTROLLER"
  } }));
} finally { await db.$disconnect(); }
')"
export MQTT_DEVICE_REGISTRY
cd ..
npm run dev
```

Terminal 3 — ESP32 simulator:

```bash
cd /home/khelifa/Desktop/semico-web
SIMULATOR_MQTT_URL=mqtt://127.0.0.1:1883 \
SIMULATOR_MQTT_TOPIC_PREFIX=semico/v1/devices \
SIMULATOR_DEVICE_ID=controller-01 \
SIMULATOR_ROOT_MOISTURE=17.5 \
SIMULATOR_TELEMETRY_INTERVAL_MS=5000 \
npm run esp32:simulator
```

Open `http://localhost:5173/dashboard`, sign in as `owner@semico.dz` / `Semico2026!`, and select **Ferme de la Mitidja** if another farm is active. Telemetry updates the moisture gauge and red banner without refreshing. Click the Dashboard irrigation button: terminal 3 prints exactly `ESP32 received: OPEN valve`, and terminal 1 shows traffic on `/telemetry`, `/commands/valve`, and `/acks/valve`.

To show a threshold crossing, start terminal 3 with `SIMULATOR_ROOT_MOISTURE=42`, then stop it with Ctrl+C and rerun with `17.5`; reverse the values to clear the moisture alert. The seeded farm may already have a red diagnostic component, so its banner can remain visible while the alert count changes. Receipt ACKs keep MQTT commands pending; the simulator does not report physical valve execution. Use Ctrl+C in each terminal when finished.

## Local configuration and broker ACLs

Set `MQTT_URL`, optional paired `MQTT_USERNAME`/`MQTT_PASSWORD`, and a valid `MQTT_DEVICE_REGISTRY` in `server/.env`. In development, an unsecured local `mqtt://` URL is accepted; production requires `mqtts://`. Leave `MQTT_URL` unset to run the REST API without a broker. The local Vite `/api` proxy forwards WebSocket upgrades to the API server.

Broker ACLs must be directional and device-scoped: the server identity needs subscribe access to `+/telemetry` and `+/acks/valve`, and publish access to `+/commands/valve`; each device identity should publish only to its own telemetry and ACK topics and subscribe only to its own command topic. In production, require TLS and per-device authentication. Never log broker credentials or expose them to the browser.
