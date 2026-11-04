import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, registerWorker, resetDatabase, testApp } from "./helpers/api.js";

/**
 * `/bookings` — public consultation booking.
 *
 * Availability and creation are public because the form sits on the marketing pages and is filled
 * in by anonymous visitors; the owner-side list and status changes are not farm-scoped, since these
 * are company consultations rather than per-farm records.
 */

beforeEach(resetDatabase);

/** A farm-local date `daysAhead` from today, as `YYYY-MM-DD`. */
function farmDate(daysAhead: number): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000 + 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

const BOOKING = {
  name: "Karim B.",
  email: "karim@example.dz",
  phone: "+213 661 000 111",
  startTime: "9:30 am",
  notes: "Interested in the Farm plan.",
};

describe("GET /bookings/availability", () => {
  it("is public and describes the slot grid", async () => {
    const response = await request(testApp()).get("/api/v1/bookings/availability").expect(200);

    expect(response.body.data.slots.length).toBeGreaterThan(0);
    expect(response.body.data.timezone).toBe("Africa/Algiers");
    expect(response.body.data.meetingType).toBe("Google Meet");
    expect(response.body.data.durationMin).toBe(30);
    expect(response.body.data.month).toMatch(/^\d{4}-\d{2}$/);
    // The month is only part-way through, so every day cannot be bookable.
    expect(Array.isArray(response.body.data.availableDays)).toBe(true);
  });

  it("marks a blocked slot unavailable on the day the picker is showing", async () => {
    // `slots` describes ONE day — the first bookable one — so a block has to be placed there to be
    // reflected. Placing it on an arbitrary future day would test nothing.
    const initial = await request(testApp()).get("/api/v1/bookings/availability").expect(200);
    const focusDay = initial.body.data.availableDays[0] as number;
    const month = initial.body.data.month as string;
    const date = `${month}-${String(focusDay).padStart(2, "0")}`;

    await prisma.bookingBlock.create({
      data: { day: new Date(`${date}T00:00:00.000Z`), startTime: "9:30 am", reason: "Team meeting" },
    });

    const response = await request(testApp()).get("/api/v1/bookings/availability").expect(200);

    const slot = response.body.data.slots.find(
      (entry: { time: string }) => entry.time === "9:30 am",
    );
    expect(slot.available).toBe(false);
    expect(slot.reason).toBe("Unavailable");
  });

  it("rejects a malformed month", async () => {
    const response = await request(testApp())
      .get("/api/v1/bookings/availability?month=not-a-month")
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("reports slots for a specifically requested day", async () => {
    const month = (
      await request(testApp()).get("/api/v1/bookings/availability").expect(200)
    ).body.data.month as string;

    const first = await request(testApp()).get("/api/v1/bookings/availability").expect(200);
    const day = first.body.data.availableDays[0] as number;
    const date = `${month}-${String(day).padStart(2, "0")}`;

    const response = await request(testApp())
      .get(`/api/v1/bookings/availability?month=${month}&date=${date}`)
      .expect(200);

    // The response has to say which day its slots describe, or the picker cannot know what it is
    // showing.
    expect(response.body.data.date).toBe(date);
  });

  it("refuses a date outside the requested month", async () => {
    const month = (
      await request(testApp()).get("/api/v1/bookings/availability").expect(200)
    ).body.data.month as string;

    const otherMonth = month === "2026-01" ? "2026-02" : "2026-01";

    const response = await request(testApp())
      .get(`/api/v1/bookings/availability?month=${month}&date=${otherMonth}-15`)
      .expect(400);

    expect(response.body.error.details).toHaveProperty("date");
  });

  it("refuses a date in the past", async () => {
    const past = farmDate(-5);
    const response = await request(testApp())
      .get(`/api/v1/bookings/availability?date=${past}`)
      .expect(400);

    expect(response.body.error.details).toHaveProperty("date");
  });
});

describe("POST /bookings", () => {
  it("creates a booking as an anonymous visitor", async () => {
    const response = await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, date: farmDate(2) })
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: "Karim B.",
      startTime: "9:30 am",
      status: "PENDING",
      timezone: "Africa/Algiers",
      durationMin: 30,
    });
  });

  it("refuses a slot that has just been taken", async () => {
    const date = farmDate(2);

    await request(testApp()).post("/api/v1/bookings").send({ ...BOOKING, date }).expect(201);

    const second = await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, email: "someone.else@example.dz", date })
      .expect(409);

    expect(second.body.error.code).toBe("SLOT_UNAVAILABLE");
  });

  it("refuses an explicitly blocked slot", async () => {
    const date = farmDate(3);
    await prisma.bookingBlock.create({
      data: { day: new Date(`${date}T00:00:00.000Z`), startTime: "2:00 pm", reason: "Unavailable" },
    });

    const response = await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, date, startTime: "2:00 pm" })
      .expect(409);

    expect(response.body.error.code).toBe("SLOT_UNAVAILABLE");
  });

  it("refuses a date in the past", async () => {
    const response = await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, date: farmDate(-5) })
      .expect(400);

    expect(response.body.error.details).toHaveProperty("date");
  });

  it("refuses a time that is not on the slot grid", async () => {
    const response = await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, date: farmDate(2), startTime: "3:17 am" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("validates the email", async () => {
    await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, email: "not-an-email", date: farmDate(2) })
      .expect(400);
  });

  it("frees the slot again when a booking is cancelled", async () => {
    const owner = await registerOwner();
    const date = farmDate(2);

    const created = await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, date })
      .expect(201);

    await request(testApp())
      .patch(`/api/v1/bookings/${created.body.data.id}`)
      .set(auth(owner.accessToken))
      .send({ status: "CANCELLED" })
      .expect(200);

    // Cancellations are excluded from availability, so the slot can be booked again.
    await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, email: "later@example.dz", date })
      .expect(201);
  });
});

describe("owner-side management", () => {
  it("lists bookings for the owner", async () => {
    const owner = await registerOwner();
    await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, date: farmDate(2) })
      .expect(201);

    const response = await request(testApp())
      .get("/api/v1/bookings")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta.total).toBe(1);
  });

  it("requires authentication to list", async () => {
    await request(testApp()).get("/api/v1/bookings").expect(401);
  });

  it("refuses a worker — this is not farm-scoped administration", async () => {
    const owner = await registerOwner();
    const worker = await registerWorker(owner.ownerCode, "ENGINEER");

    await request(testApp())
      .get("/api/v1/bookings")
      .set(auth(worker.accessToken))
      .expect(403);
  });

  it("confirms a booking", async () => {
    const owner = await registerOwner();
    const created = await request(testApp())
      .post("/api/v1/bookings")
      .send({ ...BOOKING, date: farmDate(2) })
      .expect(201);

    const response = await request(testApp())
      .patch(`/api/v1/bookings/${created.body.data.id}`)
      .set(auth(owner.accessToken))
      .send({ status: "CONFIRMED" })
      .expect(200);

    expect(response.body.data.status).toBe("CONFIRMED");
  });

  it("404s on an unknown booking", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .patch("/api/v1/bookings/does-not-exist")
      .set(auth(owner.accessToken))
      .send({ status: "CONFIRMED" })
      .expect(404);
  });
});
