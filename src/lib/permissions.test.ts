import { describe, it, expect } from "vitest";
import { can, pickPrimaryRole } from "./permissions";

describe("RBAC rules", () => {
  it("only Operations creates and dispatches demands", () => {
    expect(can(["operations"], "demands.manage")).toBe(true);
    for (const r of ["sourceur", "hrbp", "ceo", "admin"]) expect(can([r], "demands.manage")).toBe(false);
  });
  it("HRBP reads all demands but cannot manage them", () => {
    expect(can(["hrbp"], "demands.viewAll")).toBe(true);
    expect(can(["hrbp"], "demands.manage")).toBe(false);
  });
  it("admin has no business permissions", () => {
    for (const c of ["demands.viewAll", "candidates.view", "financials.view", "tjm.approve", "pipeline.finalDecision"] as const)
      expect(can(["admin"], c)).toBe(false);
    expect(can(["admin"], "users.manage")).toBe(true);
  });
  it("only Operations approves TJM and final decisions", () => {
    for (const r of ["sourceur", "hrbp", "ceo", "admin"]) {
      expect(can([r], "tjm.approve")).toBe(false);
      expect(can([r], "pipeline.finalDecision")).toBe(false);
    }
    expect(can(["operations"], "tjm.approve")).toBe(true);
  });
  it("CEO views financials read-only", () => {
    expect(can(["ceo"], "financials.view")).toBe(true);
    expect(can(["ceo"], "financials.edit")).toBe(false);
  });
  it("Sourceur cannot see financial margins", () => {
    expect(can(["sourceur"], "financials.view")).toBe(false);
  });
  it("business dashboard wins over admin for multi-role users", () => {
    expect(pickPrimaryRole(["admin", "operations"])).toBe("operations");
    expect(pickPrimaryRole(["admin"])).toBe("admin");
  });
  it("unresolved roles cannot open demand management", () => {
    expect(can(undefined, "demands.manage")).toBe(false);
    expect(can(null, "demands.manage")).toBe(false);
    expect(can([], "demands.manage")).toBe(false);
  });
  it("HRBP plus Admin cannot edit demands but keeps qualification", () => {
    expect(can(["hrbp", "admin"], "demands.manage")).toBe(false);
    expect(can(["hrbp", "admin"], "pipeline.qualify")).toBe(true);
  });
  it("Operations retains management even alongside another role", () => {
    expect(can(["operations", "hrbp"], "demands.manage")).toBe(true);
    expect(can(["operations"], "financials.edit")).toBe(true);
  });
  it("company financial access excludes HRBP and Admin-only", () => {
    expect(can(["hrbp"], "financials.view")).toBe(false);
    expect(can(["admin"], "financials.view")).toBe(false);
    expect(can(["hrbp", "admin", "sourceur"], "financials.view")).toBe(false);
  });
});
