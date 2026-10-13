import {
  availabilityQuerySchema,
  createBookingSchema,
  updateBookingStatusSchema,
  type BookingStatus,
} from "@semico/shared";
import { z } from "zod";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { created, ok } from "../../lib/response.js";
import { idParamSchema, parseBody, parseParams, parseQuery } from "../../lib/validate.js";
import { bookingsService } from "./bookings.service.js";

const listQuerySchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function authOf(req: { auth?: import("../../types/auth.js").AuthContext }) {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

export const bookingsController = {
  /** Public: the picker needs the slot grid before anyone has an account. */
  availability: asyncHandler(async (req, res) => {
    const { month, date } = parseQuery(req, availabilityQuerySchema);
    return ok(res, await bookingsService.availability(month, date));
  }),

  /** Public: the marketing pages collect consultations from anonymous visitors. */
  create: asyncHandler(async (req, res) => {
    const input = parseBody(req, createBookingSchema);
    return created(res, await bookingsService.create(input));
  }),

  list: asyncHandler(async (req, res) => {
    authOf(req);
    const query = parseQuery(req, listQuerySchema);
    const { bookings, meta } = await bookingsService.list({ status: query.status }, query);
    return ok(res, bookings, meta);
  }),

  updateStatus: asyncHandler(async (req, res) => {
    authOf(req);
    const { id } = parseParams(req, idParamSchema);
    const { status } = parseBody(req, updateBookingStatusSchema);
    return ok(res, await bookingsService.updateStatus(id, status as BookingStatus));
  }),
};
