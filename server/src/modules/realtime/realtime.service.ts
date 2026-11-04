import { realtimeRepository } from "./realtime.repository.js";

export const realtimeService = {
  issueTicket(userId: string, farmId: string) {
    return realtimeRepository.issueTicket(userId, farmId);
  },
};
