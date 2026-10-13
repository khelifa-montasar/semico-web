import { Router } from "express";
import { usersController } from "./users.controller.js";
import { requireAuth } from "../../middleware/auth.js";

/**
 * `/api/v1/users/me`
 *
 * Always `me` — there is no route taking a user id, so editing somebody else's profile is not
 * expressible rather than merely forbidden. Any authenticated user may edit their own profile:
 * this is not an owner-only concern, unlike worker management.
 *
 * Guards are per-route, not `router.use(...)` — see the note in workers.routes.ts.
 */
export const usersRoutes = Router();

const self = [requireAuth];

usersRoutes.get("/me", ...self, usersController.me);
usersRoutes.patch("/me", ...self, usersController.updateProfile);

usersRoutes.post("/me/experience", ...self, usersController.addExperience);
usersRoutes.patch("/me/experience/:id", ...self, usersController.updateExperience);
usersRoutes.delete("/me/experience/:id", ...self, usersController.deleteExperience);

usersRoutes.post("/me/education", ...self, usersController.addEducation);
usersRoutes.patch("/me/education/:id", ...self, usersController.updateEducation);
usersRoutes.delete("/me/education/:id", ...self, usersController.deleteEducation);
