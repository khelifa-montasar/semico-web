import { randomBytes } from "node:crypto";

const TICKET_TTL_MS = 30_000;
const tickets = new Map<string, { userId: string; farmId: string; expiresAt: number }>();
type AccessRevocation = { userId?: string; farmId?: string };
const revocationListeners = new Set<(scope: AccessRevocation) => void>();

export const realtimeRepository = {
  onAccessRevoked(listener: (scope: AccessRevocation) => void) {
    revocationListeners.add(listener);
    return () => { revocationListeners.delete(listener); };
  },
  revokeAccess(scope: AccessRevocation) {
    for (const [ticket, identity] of tickets) {
      if ((scope.userId && identity.userId === scope.userId) || (scope.farmId && identity.farmId === scope.farmId)) tickets.delete(ticket);
    }
    for (const listener of revocationListeners) listener(scope);
  },
  issueTicket(userId: string, farmId: string): { ticket: string; expiresInMs: number } {
    const now = Date.now();
    for (const [token, value] of tickets) {
      if (value.expiresAt <= now) tickets.delete(token);
    }

    const ticket = randomBytes(32).toString("base64url");
    tickets.set(ticket, { userId, farmId, expiresAt: now + TICKET_TTL_MS });
    return { ticket, expiresInMs: TICKET_TTL_MS };
  },

  /** Tickets are consumed before authorization is rechecked, so they cannot be replayed. */
  consumeTicket(ticket: string): { userId: string; farmId: string } | null {
    const value = tickets.get(ticket);
    tickets.delete(ticket);
    if (!value || value.expiresAt <= Date.now()) return null;
    return { userId: value.userId, farmId: value.farmId };
  },
};
