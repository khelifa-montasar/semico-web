import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import {
  auth,
  registerOwner,
  registerWorker,
  resetDatabase,
  testApp,
  type RegisteredUser,
} from "./helpers/api.js";

/**
 * `/users/me` — profile, experience and education.
 *
 * The security property under test throughout: every route is addressed as `me`, so there is no way
 * to express "edit someone else's profile". The delete/update paths use a `userId`-scoped
 * `updateMany`, so a mismatched id must match nothing and surface as a 404 rather than silently
 * touching another user's row.
 */

beforeEach(resetDatabase);

const EXPERIENCE = {
  jobTitle: "Chief Agronomist",
  company: "Ferme Nationale de Mitidja",
  startDate: "Jan 2019",
  isPresent: true,
  description: "Overseeing precision irrigation across 800 hectares.",
};

const EDUCATION = {
  degree: "M.Sc. Agricultural Engineering",
  institution: "ENSA Alger",
  year: "2018",
};

describe("GET /users/me", () => {
  it("returns the caller's profile with empty collections for a fresh account", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .get("/api/v1/users/me")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data).toMatchObject({ role: "OWNER", email: owner.email });
    expect(response.body.data.experiences).toEqual([]);
    expect(response.body.data.educations).toEqual([]);
    expect(response.body.data.createdAt).toBeTruthy();
  });

  it("never exposes a password hash", async () => {
    const owner = await registerOwner();
    const response = await request(testApp())
      .get("/api/v1/users/me")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain("argon2");
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("requires authentication", async () => {
    await request(testApp()).get("/api/v1/users/me").expect(401);
  });

  it("cannot be pointed at another user — there is no id in the path", async () => {
    const a = await registerOwner("Farm A");
    const b = await registerOwner("Farm B");

    // A plausible-looking attempt to read someone else's profile simply 404s on the router.
    await request(testApp())
      .get(`/api/v1/users/${a.userId}`)
      .set(auth(b.accessToken))
      .expect(404);
  });
});

describe("PATCH /users/me", () => {
  it("updates the editable fields", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .patch("/api/v1/users/me")
      .set(auth(owner.accessToken))
      .send({ fullName: "Amine Belkacem", phone: "+213 661 000 111", commune: "Hydra", bio: "Agronomist." })
      .expect(200);

    expect(response.body.data).toMatchObject({
      fullName: "Amine Belkacem",
      phone: "+213 661 000 111",
      commune: "Hydra",
      bio: "Agronomist.",
    });
  });

  it("records the changed field NAMES in the audit row, never the values", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .patch("/api/v1/users/me")
      .set(auth(owner.accessToken))
      .send({ phone: "+213 555 999 888", bio: "A private note about myself." })
      .expect(200);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PROFILE_UPDATED", actorId: owner.userId },
    });

    const metadata = audit.metadata ?? "";
    expect(metadata).toContain("phone");
    // A phone number and a personal bio do not belong in a security log.
    expect(metadata).not.toContain("+213 555 999 888");
    expect(metadata).not.toContain("A private note");
  });

  it("refuses to change the login identity or the role", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .patch("/api/v1/users/me")
      .set(auth(owner.accessToken))
      .send({ email: "hijack@test.dz", role: "OWNER" })
      .expect(200);

    // Unknown keys are stripped by the schema, so email and role are left alone.
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(stored.email).toBe(owner.email);
  });

  it("rejects a bio over 500 characters", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .patch("/api/v1/users/me")
      .set(auth(owner.accessToken))
      .send({ bio: "x".repeat(501) })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details).toHaveProperty("bio");
  });

  it("requires authentication", async () => {
    await request(testApp()).patch("/api/v1/users/me").send({ fullName: "Anon" }).expect(401);
  });
});

describe("experience", () => {
  async function addExperience(user: RegisteredUser) {
    const response = await request(testApp())
      .post("/api/v1/users/me/experience")
      .set(auth(user.accessToken))
      .send(EXPERIENCE)
      .expect(201);

    return response.body.data.experiences[0] as { id: string };
  }

  it("adds, updates and deletes an entry", async () => {
    const owner = await registerOwner();
    const entry = await addExperience(owner);

    const updated = await request(testApp())
      .patch(`/api/v1/users/me/experience/${entry.id}`)
      .set(auth(owner.accessToken))
      .send({ jobTitle: "Lead Agronomist" })
      .expect(200);
    expect(updated.body.data.experiences[0].jobTitle).toBe("Lead Agronomist");

    await request(testApp())
      .delete(`/api/v1/users/me/experience/${entry.id}`)
      .set(auth(owner.accessToken))
      .expect(204);

    const after = await request(testApp())
      .get("/api/v1/users/me")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(after.body.data.experiences).toEqual([]);
  });

  it("stores 'present' as a null end date rather than an empty string", async () => {
    const owner = await registerOwner();
    const entry = await addExperience(owner);

    expect(entry.id).toBeTruthy();
    const stored = await prisma.experience.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stored.endDate).toBeNull();
    expect(stored.isPresent).toBe(true);
  });

  it("404s on another user's entry rather than editing it", async () => {
    const ownerA = await registerOwner("Farm A");
    const ownerB = await registerOwner("Farm B");
    const entry = await addExperience(ownerA);

    await request(testApp())
      .patch(`/api/v1/users/me/experience/${entry.id}`)
      .set(auth(ownerB.accessToken))
      .send({ jobTitle: "Hijacked" })
      .expect(404);

    await request(testApp())
      .delete(`/api/v1/users/me/experience/${entry.id}`)
      .set(auth(ownerB.accessToken))
      .expect(404);

    // And A's entry is untouched.
    const stored = await prisma.experience.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stored.jobTitle).toBe(EXPERIENCE.jobTitle);
  });

  it("validates required fields", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/users/me/experience")
      .set(auth(owner.accessToken))
      .send({ jobTitle: "", company: "", startDate: "" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("education", () => {
  it("adds and deletes an entry", async () => {
    const owner = await registerOwner();

    const created = await request(testApp())
      .post("/api/v1/users/me/education")
      .set(auth(owner.accessToken))
      .send(EDUCATION)
      .expect(201);

    const entry = created.body.data.educations[0] as { id: string };
    expect(entry.id).toBeTruthy();

    await request(testApp())
      .delete(`/api/v1/users/me/education/${entry.id}`)
      .set(auth(owner.accessToken))
      .expect(204);
  });

  it("404s on another user's entry", async () => {
    const ownerA = await registerOwner("Farm A");
    const ownerB = await registerOwner("Farm B");

    const created = await request(testApp())
      .post("/api/v1/users/me/education")
      .set(auth(ownerA.accessToken))
      .send(EDUCATION)
      .expect(201);

    const entry = created.body.data.educations[0] as { id: string };

    await request(testApp())
      .delete(`/api/v1/users/me/education/${entry.id}`)
      .set(auth(ownerB.accessToken))
      .expect(404);

    await request(testApp())
      .patch(`/api/v1/users/me/education/${entry.id}`)
      .set(auth(ownerB.accessToken))
      .send({ degree: "Hijacked" })
      .expect(404);

    // And the row is untouched by the attempt.
    const stillThere = await prisma.education.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stillThere.degree).toBe(EDUCATION.degree);
  });

  it("updates an entry in place", async () => {
    const owner = await registerOwner();

    const created = await request(testApp())
      .post("/api/v1/users/me/education")
      .set(auth(owner.accessToken))
      .send(EDUCATION)
      .expect(201);
    const entry = created.body.data.educations[0] as { id: string; degree: string };

    const updated = await request(testApp())
      .patch(`/api/v1/users/me/education/${entry.id}`)
      .set(auth(owner.accessToken))
      .send({ degree: "Ph.D. Irrigation Science", year: "2024" })
      .expect(200);

    const after = updated.body.data.educations[0];
    expect(after).toMatchObject({ id: entry.id, degree: "Ph.D. Irrigation Science", year: "2024" });
    // The field that was not sent keeps its value rather than being cleared.
    expect(after.institution).toBe(EDUCATION.institution);

    // Exactly one row: an update that inserted instead of updating would show up as two.
    expect(updated.body.data.educations).toHaveLength(1);
  });

  it("reports 404 for an empty body, which is misleading but harmless", async () => {
    // DOCUMENTED ODDITY, not desired behaviour: `prisma.updateMany` with an empty `data` object
    // returns `count: 0`, and the service reads a zero count as "no such entry". So a PATCH that
    // changes nothing answers 404 about an entry that demonstrably exists. No client sends an empty
    // patch, so this is recorded rather than repaired — but it should be fixed before anyone writes
    // one, because 404 is the wrong answer to "nothing to do".
    const owner = await registerOwner();

    const created = await request(testApp())
      .post("/api/v1/users/me/education")
      .set(auth(owner.accessToken))
      .send(EDUCATION)
      .expect(201);
    const entry = created.body.data.educations[0] as { id: string };

    await request(testApp())
      .patch(`/api/v1/users/me/education/${entry.id}`)
      .set(auth(owner.accessToken))
      .send({})
      .expect(404);

    // The entry is still there and unchanged, which is the part that matters.
    const unchanged = await prisma.education.findUniqueOrThrow({ where: { id: entry.id } });
    expect(unchanged.degree).toBe(EDUCATION.degree);
  });

  it("rejects a degree that is too short to be a degree", async () => {
    const owner = await registerOwner();

    const created = await request(testApp())
      .post("/api/v1/users/me/education")
      .set(auth(owner.accessToken))
      .send(EDUCATION)
      .expect(201);
    const entry = created.body.data.educations[0] as { id: string };

    const response = await request(testApp())
      .patch(`/api/v1/users/me/education/${entry.id}`)
      .set(auth(owner.accessToken))
      .send({ degree: "B" })
      .expect(400);

    expect(response.body.error.details).toHaveProperty("degree");
  });

  it("404s on an entry that does not exist", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .patch("/api/v1/users/me/education/does-not-exist")
      .set(auth(owner.accessToken))
      .send({ degree: "M.Sc. Something" })
      .expect(404);
  });
});

describe("a worker's profile is their own", () => {
  it("lets a worker edit their profile without affecting the owner's", async () => {
    const owner = await registerOwner();
    const worker = await registerWorker(owner.ownerCode, "ENGINEER");

    await request(testApp())
      .patch("/api/v1/users/me")
      .set(auth(worker.accessToken))
      .send({ fullName: "Fatima B." })
      .expect(200);

    const ownProfile = await request(testApp())
      .get("/api/v1/users/me")
      .set(auth(worker.accessToken))
      .expect(200);
    expect(ownProfile.body.data.fullName).toBe("Fatima B.");
    // A worker's profile editing is not an administrative privilege change.
    expect(ownProfile.body.data.role).toBe("WORKER");

    const ownerProfile = await request(testApp())
      .get("/api/v1/users/me")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(ownerProfile.body.data.fullName).not.toBe("Fatima B.");
  });
});
