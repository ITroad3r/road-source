import { describe, it, expect } from "vitest";
import { finalApprovalBlocker, canApproveTjmFor, placementBlocker } from "./decisions";
import { can } from "./permissions";

describe("qualification & TJM rules", () => {
  it("final approval needs HRBP qualification", () => {
    expect(finalApprovalBlocker("pending", null)).toBe("notQualified");
    expect(finalApprovalBlocker("rejected", "approved")).toBe("notQualified");
  });
  it("Operations candidate approval precedes TJM approval", () => {
    expect(finalApprovalBlocker("qualified", "draft")).toBeNull();
    expect(finalApprovalBlocker("qualified", "approved")).toBeNull();
  });
  it("Operations can review qualified candidates before any rate exists", () => {
    expect(finalApprovalBlocker("qualified", null)).toBeNull();
  });
  it("TJM approval needs qualification AND Operations candidate approval, except grandfathered placements", () => {
    expect(canApproveTjmFor("pending", false, "approved")).toBe(false);
    expect(canApproveTjmFor("rejected", false, "approved")).toBe(false);
    expect(canApproveTjmFor("qualified", false, "approved")).toBe(true);
    expect(canApproveTjmFor("qualified", false, "pending")).toBe(false);
    expect(canApproveTjmFor("qualified", false, "rejected")).toBe(false);
    expect(canApproveTjmFor("pending", true, "pending")).toBe(true);
  });
  it("new placement needs qualification, approved TJM and final approval", () => {
    expect(placementBlocker("pending", "approved", "approved", false)).toBe("notQualified");
    expect(placementBlocker("qualified", null, "approved", false)).toBe("tjmNotApproved");
    expect(placementBlocker("qualified", "approved", "pending", false)).toBe("noFinalApproval");
    expect(placementBlocker("qualified", "approved", "approved", false)).toBeNull();
    expect(placementBlocker("pending", null, "pending", true)).toBeNull();
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
