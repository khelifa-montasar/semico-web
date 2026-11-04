import type { ValveCommandMessage } from "@semico/shared";

export interface ValveCommandTransport {
  assertCanRoute(farmId: string, zoneId: string): void;
  publishValveCommand(command: ValveCommandMessage, farmId: string): Promise<void>;
}

let transport: ValveCommandTransport | null = null;

export function setValveCommandTransport(value: ValveCommandTransport | null): void {
  transport = value;
}

export function getValveCommandTransport(): ValveCommandTransport | null {
  return transport;
}
