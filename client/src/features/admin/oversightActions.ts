import type { AdminUser, FarmStatus, SetUserStatusInput } from "@semico/shared";

export function nextFarmStatus(status: FarmStatus): FarmStatus {
  return status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
}

export function nextUserStatus(
  user: Pick<AdminUser, "status" | "platformDisabled">,
): SetUserStatusInput["status"] {
  return user.status === "ACTIVE" && !user.platformDisabled
    ? "DISABLED"
    : "ACTIVE";
}

export function canChangeUserStatus(
  actorId: string | undefined,
  user: AdminUser,
): boolean {
  return (
    actorId !== undefined &&
    !(actorId === user.id && nextUserStatus(user) === "DISABLED")
  );
}
