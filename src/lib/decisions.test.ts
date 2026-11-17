import { describe, it, expect } from "vitest";
import { finalApprovalBlocker, canApproveTjmFor } from "./decisions";
import { can } from "./permissions";

describe("qualification & TJM rules", () => {
  it("final approval needs HRBP qualification", () => {
    expect(finalApprovalBlocker("pending", null)).toBe("notQualified");
    expect(finalApprovalBlocker("rejected", "approved")).toBe("notQualified");
  });
  it("final approval needs an approved TJM when a rate exists", () => {
    expect(finalApprovalBlocker("qualified", "draft")).toBe("tjmNotApproved");
    expect(finalApprovalBlocker("qualified", "approved")).toBeNull();
  });
  it("final approval blocked when qualified but no rate row exists", () => {
    expect(finalApprovalBlocker("qualified", null)).toBe("tjmNotApproved");
  });
  it("TJM approval needs qualification, except historical placed rows", () => {
    expect(canApproveTjmFor("pending", "submitted")).toBe(false);
    expect(canApproveTjmFor("rejected", "offer")).toBe(false);
    expect(canApproveTjmFor("qualified", "identified")).toBe(true);
    expect(canApproveTjmFor("pending", "placed")).toBe(true);
  });
  it("HRBP qualifies but cannot decide or approve TJM", () => {
    expect(can(["hrbp"], "pipeline.qualify")).toBe(true);
    expect(can(["hrbp"], "pipeline.finalDecision")).toBe(false);
    expect(can(["hrbp"], "tjm.approve")).toBe(false);
  });
  it("Sourceur cannot qualify", () => {
    expect(can(["sourceur"], "pipeline.qualify")).toBe(false);
  });
});
