import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, registerWorker, resetDatabase, testApp } from "./helpers/api.js";

/**
 * `/leads` — the public lead-capture form.
 *
 * This endpoint exists because the form on the Services page used to promise "we'll be in touch
 * within 24 hours" and send nothing. These tests hold the two halves of that fix: the enquiry is
 * actually stored, and it surfaces somewhere an owner will see it.
 */

beforeEach(resetDatabase);

const LEAD = {
  name: "Karim B.",
  email: "karim@example.dz",
  phone: "+213 661 000 111",
  landArea: "12 ha",
};

describe("POST /leads", () => {
  it("stores an enquiry from an anonymous visitor", async () => {
    const response = await request(testApp()).post("/api/v1/leads").send(LEAD).expect(201);

    expect(response.body.data).toMatchObject({
      name: "Karim B.",
      email: "karim@example.dz",
      phone: "+213 661 000 111",
      landArea: "12 ha",
      status: "NEW",
    });

    // The point of the fix: it is in the database, not just on the visitor's screen.
    const stored = await prisma.lead.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.email).toBe("karim@example.dz");
  });

  it("accepts a minimal enquiry with no phone or land area", async () => {
    const response = await request(testApp())
      .post("/api/v1/leads")
      .send({ name: "Amira T.", email: "amira@example.dz" })
      .expect(201);

    // Absent optional fields are null, not empty strings.
    expect(response.body.data.phone).toBeNull();
    expect(response.body.data.landArea).toBeNull();
  });

  it("treats blank optional fields as not provided", async () => {
    const response = await request(testApp())
      .post("/api/v1/leads")
      .send({ ...LEAD, phone: "   ", landArea: "" })
      .expect(201);

    expect(response.body.data.phone).toBeNull();
    expect(response.body.data.landArea).toBeNull();
  });

  it("records which language the visitor was reading", async () => {
    const response = await request(testApp())
      .post("/api/v1/leads")
      .send({ ...LEAD, locale: "ar" })
      .expect(201);

    expect(response.body.data.locale).toBe("ar");
  });

  it("rejects a malformed email", async () => {
    const response = await request(testApp())
      .post("/api/v1/leads")
      .send({ ...LEAD, email: "not-an-email" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details).toHaveProperty("email");
  });

  it("rejects a missing name", async () => {
    const response = await request(testApp())
      .post("/api/v1/leads")
      .send({ email: "someone@example.dz" })
      .expect(400);

    expect(response.body.error.details).toHaveProperty("name");
  });
});

describe("GET /leads", () => {
  it("requires authentication", async () => {
    await request(testApp()).get("/api/v1/leads").expect(401);
  });

  it("refuses a worker — a lead list is a sales pipeline, not farm data", async () => {
    const owner = await registerOwner();
    const worker = await registerWorker(owner.ownerCode, "ENGINEER");

    await request(testApp())
      .get("/api/v1/leads")
      .set(auth(worker.accessToken))
      .expect(403);
  });

  it("lists enquiries for the owner, newest first", async () => {
    const owner = await registerOwner();

    await request(testApp()).post("/api/v1/leads").send({ ...LEAD, name: "First" }).expect(201);
    await request(testApp())
      .post("/api/v1/leads")
      .send({ ...LEAD, email: "second@example.dz", name: "Second" })
      .expect(201);

    const response = await request(testApp())
      .get("/api/v1/leads")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta.total).toBe(2);
    // Worked from the top of the list, so the most recent enquiry comes first.
    expect(response.body.data[0].name).toBe("Second");
  });

  it("filters by status", async () => {
    const owner = await registerOwner();
    const created = await request(testApp()).post("/api/v1/leads").send(LEAD).expect(201);

    await request(testApp())
      .patch(`/api/v1/leads/${created.body.data.id}`)
      .set(auth(owner.accessToken))
      .send({ status: "CONTACTED" })
      .expect(200);

    const contacted = await request(testApp())
      .get("/api/v1/leads?status=CONTACTED")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(contacted.body.data).toHaveLength(1);

    const fresh = await request(testApp())
      .get("/api/v1/leads?status=NEW")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(fresh.body.data).toHaveLength(0);
  });
});

describe("PATCH /leads/:id", () => {
  it("moves a lead through its lifecycle and records notes", async () => {
    const owner = await registerOwner();
    const created = await request(testApp()).post("/api/v1/leads").send(LEAD).expect(201);

    const response = await request(testApp())
      .patch(`/api/v1/leads/${created.body.data.id}`)
      .set(auth(owner.accessToken))
      .send({ status: "CONTACTED", notes: "Called, wants a quote for 12 ha of olives." })
      .expect(200);

    expect(response.body.data).toMatchObject({ status: "CONTACTED" });
    expect(response.body.data.notes).toContain("12 ha");
  });

  it("404s on an unknown lead", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .patch("/api/v1/leads/does-not-exist")
      .set(auth(owner.accessToken))
      .send({ status: "CLOSED" })
      .expect(404);
  });

  it("refuses a worker", async () => {
    const owner = await registerOwner();
    const worker = await registerWorker(owner.ownerCode, "OPERATOR");
    const created = await request(testApp()).post("/api/v1/leads").send(LEAD).expect(201);

    await request(testApp())
      .patch(`/api/v1/leads/${created.body.data.id}`)
      .set(auth(worker.accessToken))
      .send({ status: "CLOSED" })
      .expect(403);
  });
});
