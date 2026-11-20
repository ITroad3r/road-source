import { describe, it, expect } from "vitest";
import { allowedActions, frequencyFor, validateProposal, currentValues, inQueue } from "./compensation";
import { finalApprovalBlocker, placementBlocker } from "./decisions";

describe("compensation rules", () => {
  it("CDI and CDD are monthly salaries, Freelance is a daily TJM", () => {
    expect(frequencyFor("cdi")).toBe("monthly");
    expect(frequencyFor("cdd")).toBe("monthly");
    expect(frequencyFor("freelance")).toBe("daily");
  });
  it("submission requires a contract type and a positive amount; drafts may be incomplete", () => {
    expect(validateProposal(null, "4000", true)).toBe("typeRequired");
    expect(validateProposal("cdi", "", true)).toBe("amountRequired");
    expect(validateProposal("cdi", "-1", true)).toBe("amountInvalid");
    expect(validateProposal("cdi", "abc", true)).toBe("amountInvalid");
    expect(validateProposal("cdi", "4200", true)).toBeNull();
    expect(validateProposal(null, "", false)).toBeNull();
  });
  it("assigned Sourceur submits; unassigned Sourceur cannot", () => {
    expect(allowedActions(null, ["sourceur"], true)).toEqual(["save_draft", "submit"]);
    expect(allowedActions(null, ["sourceur"], false)).toEqual([]);
    expect(allowedActions("pending_manager_review", ["sourceur"], true)).toEqual([]);
    expect(allowedActions("returned_to_sourceur", ["sourceur"], true)).toContain("submit");
  });
  it("only HRBP reviews, forwards and returns to Sourceur", () => {
    expect(allowedActions("pending_manager_review", ["hrbp"], false)).toEqual(["manager_review", "forward", "return_to_sourceur"]);
    expect(allowedActions("returned_to_manager", ["hrbp"], false)).toContain("forward");
    expect(allowedActions("pending_manager_review", ["operations"], false)).toEqual([]);
  });
  it("only Operations approves, rejects, returns, reopens and amends", () => {
    expect(allowedActions("pending_operations_review", ["operations"], false)).toEqual(["approve", "return_to_manager", "reject"]);
    expect(allowedActions("pending_operations_review", ["hrbp"], false)).toEqual([]);
    expect(allowedActions("rejected", ["operations"], false)).toEqual(["reopen"]);
    expect(allowedActions("approved", ["operations"], false)).toEqual(["start_amendment"]);
    expect(allowedActions("approved", ["hrbp"], false)).toEqual([]);
  });
  it("CEO, Admin and no-role users have no compensation actions", () => {
    for (const r of [["ceo"], ["admin"], []]) {
      for (const s of ["draft", "pending_manager_review", "pending_operations_review", "approved", "rejected"] as const)
        expect(allowedActions(s, r, true)).toEqual([]);
    }
  });
  it("current values follow the stage: amended values in review, final values once approved", () => {
    const base = { proposed_contract_type: "cdi", proposed_amount: 4200, manager_contract_type: "cdd", manager_amount: 4100, final_contract_type: "cdd", final_amount: 4150 } as const;
    expect(currentValues({ ...base, status: "pending_operations_review" })).toEqual({ type: "cdd", amount: 4100 });
    expect(currentValues({ ...base, status: "approved" })).toEqual({ type: "cdd", amount: 4150 });
    expect(currentValues({ ...base, status: "returned_to_sourceur" })).toEqual({ type: "cdi", amount: 4200 });
  });
  it("queues", () => {
    expect(inQueue("returned_to_manager", "hrbp")).toBe(true);
    expect(inQueue("pending_operations_review", "operations")).toBe(true);
    expect(inQueue("pending_operations_review", "hrbp")).toBe(false);
  });
  it("CDI/CDD final approval does not need a commercial TJM; Freelance does", () => {
    expect(finalApprovalBlocker("qualified", null, { status: "approved", final_contract_type: "cdi" })).toBeNull();
    expect(finalApprovalBlocker("qualified", null, { status: "approved", final_contract_type: "freelance" })).toBe("commercialTjmRequired");
    expect(finalApprovalBlocker("qualified", "approved", { status: "approved", final_contract_type: "freelance" })).toBeNull();
    expect(finalApprovalBlocker("qualified", "approved", { status: "pending_operations_review", final_contract_type: null })).toBe("compensationNotApproved");
    expect(placementBlocker("qualified", null, "approved", false, { status: "approved", final_contract_type: "cdd" })).toBeNull();
  });
});

import { compQueueCounts } from "./compensation";
describe("compensation dashboard counts", () => {
  it("counts only real pending work for each role", () => {
    const me = "u1";
    const rows = [
      { requires_compensation: true, assigned_to: me, status: null },                       // new, nothing submitted
      { requires_compensation: false, assigned_to: me, status: null },                      // legacy: not pending
      { requires_compensation: true, assigned_to: me, status: "returned_to_sourceur" as const },
      { requires_compensation: true, assigned_to: "u2", status: "draft" as const },           // someone else's
      { requires_compensation: true, assigned_to: me, status: "pending_manager_review" as const },
      { requires_compensation: true, assigned_to: me, status: "returned_to_manager" as const },
      { requires_compensation: true, assigned_to: me, status: "pending_operations_review" as const },
      { requires_compensation: true, assigned_to: me, status: "approved" as const },
    ];
    expect(compQueueCounts(rows, me)).toEqual({ sourceur: 2, returnedToSourceur: 1, hrbp: 2, returnedToManager: 1, operations: 1, approved: 1 });
  });
});
