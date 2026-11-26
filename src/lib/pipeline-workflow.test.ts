import { describe, expect, it } from "vitest";
import { canMoveCandidate, PIPELINE_STAGES, readyForHrbp } from "./pipeline-workflow";
const pending = { stage: "identified", qualification_status: "pending", final_decision: "pending" };
describe("candidate handoff order", () => {
  it("Sourcer goes Identified → Contacted → For Screening/Approval without skipping", () => {
    expect(canMoveCandidate(["sourceur"], pending, "contacted")).toBe(true);
    expect(canMoveCandidate(["sourceur"], pending, "screened")).toBe(false);
    expect(canMoveCandidate(["sourceur"], { ...pending, stage: "contacted" }, "screened")).toBe(true);
    expect(canMoveCandidate(["sourceur"], { ...pending, stage: "contacted" }, "identified")).toBe(false);
  });
  it("HRBP reviews only after screening handoff, not initial contact", () => {
    expect(readyForHrbp("identified")).toBe(false);
    expect(readyForHrbp("contacted")).toBe(false);
    expect(readyForHrbp("screened")).toBe(true);
  });
  it("no role can progress past screening without both reviews", () => {
    for (const role of ["sourceur", "hrbp", "operations"]) {
      expect(canMoveCandidate([role], { ...pending, stage: "screened" }, "submitted")).toBe(false);
      expect(canMoveCandidate([role], { ...pending, stage: "screened", qualification_status: "qualified" }, "submitted")).toBe(false);
      expect(canMoveCandidate([role], { stage: "screened", qualification_status: "qualified", final_decision: "approved" }, "submitted")).toBe(true);
    }
  });
  it("CEO and Admin-only cannot move candidates in any visible status", () => {
    for (const role of ["ceo", "admin", "unknown"]) for (const stage of PIPELINE_STAGES) {
      expect(canMoveCandidate([role], pending, stage)).toBe(false);
    }
    expect(canMoveCandidate(undefined, pending, "contacted")).toBe(false);
  });
  it("Sourcer progresses later stages sequentially and cannot withdraw a placement", () => {
    const approved = { stage: "submitted", qualification_status: "qualified", final_decision: "approved" };
    expect(canMoveCandidate(["sourceur"], approved, "client_interview")).toBe(true);
    expect(canMoveCandidate(["sourceur"], approved, "placed")).toBe(false);
    expect(canMoveCandidate(["sourceur"], { ...approved, stage: "placed" }, "withdrawn")).toBe(false);
  });
});