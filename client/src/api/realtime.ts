import { api } from "../lib/api/http";

export interface RealtimeTicket {
  ticket: string;
  expiresInMs: number;
}

export const realtimeApi = {
  ticket: () => api.post<RealtimeTicket>("/farms/me/realtime-ticket"),
};
