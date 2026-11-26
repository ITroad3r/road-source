import { describe, it, expect } from "vitest";
import { can, pickPrimaryRole } from "./permissions";

describe("RBAC rules", () => {
  it("Sourcers and HRBP can edit and delete contact and screening information", () => {
    expect(can(["sourceur"], "pipeline.dossier.edit")).toBe(true);
    expect(can(["hrbp"], "pipeline.dossier.edit")).toBe(true);
    for (const role of ["operations", "ceo", "admin"]) expect(can([role], "pipeline.dossier.edit")).toBe(false);
    expect(can(undefined, "pipeline.dossier.edit")).toBe(false);
  });
  it("HRBP (Sourcing Manager) and Operations create and dispatch demands and clients", () => {
    for (const r of ["hrbp", "operations"]) {
      expect(can([r], "demands.manage")).toBe(true);
      expect(can([r], "clients.manage")).toBe(true);
    }
    for (const r of ["sourceur", "ceo", "admin"]) expect(can([r], "demands.manage")).toBe(false);
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
  it("unknown and no-role accounts cannot create demands or clients", () => {
    expect(can(["unknown"], "demands.manage")).toBe(false);
    expect(can([], "demands.manage")).toBe(false);
    expect(can(["unknown"], "clients.manage")).toBe(false);
  });
  it("HRBP plus Admin manages demands and keeps qualification", () => {
    expect(can(["hrbp", "admin"], "demands.manage")).toBe(true);
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
