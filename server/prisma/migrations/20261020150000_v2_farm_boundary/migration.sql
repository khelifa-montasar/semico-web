-- V2 Phase 4: the owner-drawn farm outline.
--
-- Nullable on purpose. A farm with no drawn outline is a normal state — the maps fall back to the
-- generated grid — so "not set" must be representable. Storing an empty array or a zero-point
-- polygon instead would make "never drawn" indistinguishable from "drawn and then cleared".
ALTER TABLE "Farm" ADD COLUMN "boundaryJson" TEXT;
