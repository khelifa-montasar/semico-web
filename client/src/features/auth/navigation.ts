import type { Role } from "@semico/shared";

/** Return users to a route belonging to their portal after login or signup. */
export function getPostLoginDestination(role: Role, requestedPath?: string): string {
  const prefix = role === "SUPER_ADMIN" ? "/admin" : "/dashboard";
  if (requestedPath === prefix || requestedPath?.startsWith(`${prefix}/`)) return requestedPath;
  return role === "SUPER_ADMIN" ? "/admin/dashboard" : "/dashboard";
}
