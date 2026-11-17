import { describe, it, expect } from "vitest";
import { finalApprovalBlocker } from "./decisions";
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
  it("final approval allowed when qualified and no rate row", () => {
    expect(finalApprovalBlocker("qualified", null)).toBeNull();
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
