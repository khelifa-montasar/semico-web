import { z } from "zod";
import {
  FARM_STATUSES,
  type FarmStatus,
  type Role,
  type UserStatus,
  type WorkerType,
} from "../enums.js";

/** Platform data is available only to active SUPER_ADMIN accounts. */
export interface RecentFarmSignup {
  id: string;
  name: string;
  createdAt: string;
  owner: { id: string; fullName: string; email: string };
}

export interface PlatformStats {
  totalFarms: number;
  totalUsers: number;
  totalActiveMqttDevices: number;
  recentFarms: RecentFarmSignup[];
  mqttActivityWindowSeconds: number;
}

export const MQTT_ACTIVITY_WINDOW_SECONDS = 120;

export const setFarmStatusSchema = z
  .object({ status: z.enum(FARM_STATUSES) })
  .strict();
export const setUserStatusSchema = z
  .object({ status: z.enum(["ACTIVE", "DISABLED"]) })
  .strict();
export type SetFarmStatusInput = z.infer<typeof setFarmStatusSchema>;
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

export interface AdminFarm {
  id: string;
  name: string;
  status: FarmStatus;
  createdAt: string;
  owner: { id: string; fullName: string; email: string };
  workerCount: number;
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  workerType: WorkerType | null;
  status: UserStatus;
  platformDisabled: boolean;
  createdAt: string;
  farm: { id: string; name: string } | null;
  ownedFarms: Array<{ id: string; name: string }>;
}
