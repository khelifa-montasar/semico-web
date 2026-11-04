import { ALERT_RULES, IRRIGATION } from "../config";
import type { Alert, AlertSeverity, AlertType, SimulationState } from "../types";

/**
 * The four alert rules.
 *
 * Each rule is a condition on the current state; `evaluateAlerts` diffs those against the alerts
 * already open so that an ongoing condition does not raise a new alert every tick, and a condition
 * that clears resolves its alert instead of silently vanishing from the list.
 *
 * There are exactly four rules. No others.
 */

/** How many resolved alerts to keep for the drawer's per-zone history before dropping the oldest. */
const MAX_RESOLVED_ALERTS = 60;

interface Condition {
  type: AlertType;
  severity: AlertSeverity;
  zoneId: string;
  targetId: string;
}

/**
 * Which conditions hold right now.
 *
 * Pure: reads state, returns findings, changes nothing.
 */
function conditionsFor(state: SimulationState): Condition[] {
  const conditions: Condition[] = [];

  for (const zone of state.zones) {
    // dry — moisture has been below the floor for enough consecutive readings.
    if (zone.consecutiveDry >= ALERT_RULES.dryConsecutive) {
      conditions.push({ type: "dry", severity: "warning", zoneId: zone.id, targetId: zone.id });
    }

    // wet — moisture has been above the ceiling for enough consecutive readings.
    if (zone.consecutiveWet >= ALERT_RULES.wetConsecutive) {
      conditions.push({ type: "wet", severity: "warning", zoneId: zone.id, targetId: zone.id });
    }

    // noIrrigation — the schedule came due and the valve never started. The only critical rule.
    if (zone.pendingStartMinutes >= IRRIGATION.pendingStartGraceMinutes) {
      conditions.push({
        type: "noIrrigation",
        severity: "critical",
        zoneId: zone.id,
        targetId: zone.id,
      });
    }
  }

  // offline — a sensor has gone quiet for longer than the rule allows.
  for (const sensor of state.sensors) {
    if (state.min - sensor.lastReportMinute >= ALERT_RULES.offlineAfterMinutes) {
      conditions.push({
        type: "offline",
        severity: "info",
        zoneId: sensor.zoneId,
        targetId: sensor.id,
      });
    }
  }

  return conditions;
}

/** Stable identity for "the alert about this condition", so it is raised once and then kept. */
function conditionKey(condition: { type: AlertType; targetId: string }): string {
  return `${condition.type}:${condition.targetId}`;
}

/**
 * Reconciles the alert list with what is currently true.
 *
 * Raises alerts for conditions that have just become true, keeps open alerts whose condition still
 * holds, and marks the rest resolved — so the panel shows a clean active list while the drawer can
 * still show what happened earlier.
 */
export function evaluateAlerts(state: SimulationState): Alert[] {
  const conditions = conditionsFor(state);
  const openKeys = new Set(conditions.map(conditionKey));

  const stillOpen: Alert[] = [];
  const newlyResolved: Alert[] = [];

  for (const alert of state.alerts) {
    if (!alert.active) continue;
    if (openKeys.has(conditionKey(alert))) stillOpen.push(alert);
    else newlyResolved.push({ ...alert, active: false });
  }

  const raised: Alert[] = conditions
    .filter(
      (condition) =>
        !state.alerts.some(
          (alert) => alert.active && conditionKey(alert) === conditionKey(condition),
        ),
    )
    .map((condition) => ({
      id: `${conditionKey(condition)}:${state.min}`,
      type: condition.type,
      severity: condition.severity,
      zoneId: condition.zoneId,
      targetId: condition.targetId,
      raisedAtMinute: state.min,
      detail: null,
      active: true,
    }));

  // Resolved ones are kept for the drawer, newest first, capped so a long demo cannot grow forever.
  const resolved = [...newlyResolved, ...state.alerts.filter((alert) => !alert.active)]
    .sort((a, b) => b.raisedAtMinute - a.raisedAtMinute)
    .slice(0, MAX_RESOLVED_ALERTS);

  return [...stillOpen, ...raised, ...resolved];
}

/** Active alerts, most recent first — the order the panel renders. */
export function activeAlerts(alerts: Alert[]): Alert[] {
  return alerts.filter((alert) => alert.active).sort((a, b) => b.raisedAtMinute - a.raisedAtMinute);
}

/** Every alert raised for one zone, active or not, most recent first — the drawer's list. */
export function alertsForZone(alerts: Alert[], zoneId: string): Alert[] {
  return alerts
    .filter((alert) => alert.zoneId === zoneId)
    .sort((a, b) => b.raisedAtMinute - a.raisedAtMinute);
}

/** Critical alerts currently open, for KPI 4's accent and its `N critical` sub-line. */
export function criticalCount(alerts: Alert[]): number {
  return alerts.filter((alert) => alert.active && alert.severity === "critical").length;
}
