// Mirrors public.compensation_action (database is the enforcement point).
import { can } from "./permissions";

export const CONTRACT_TYPES = ["cdi", "cdd", "freelance"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const COMP_STATUSES = [
  "draft", "pending_manager_review", "returned_to_sourceur", "reviewed_by_manager",
  "pending_operations_review", "returned_to_manager", "approved", "rejected",
] as const;
export type CompStatus = (typeof COMP_STATUSES)[number];
export type CompAction =
  | "save_draft" | "submit" | "manager_review" | "forward" | "return_to_sourceur"
  | "approve" | "reject" | "return_to_manager" | "reopen" | "start_amendment";

export type Frequency = "monthly" | "daily";
export function frequencyFor(t: ContractType | null | undefined): Frequency | null {
  if (!t) return null;
  return t === "freelance" ? "daily" : "monthly";
}

export type ProposalLike = {
  status: CompStatus;
  proposed_contract_type: ContractType | null; proposed_amount: number | null;
  manager_contract_type: ContractType | null; manager_amount: number | null;
  final_contract_type: ContractType | null; final_amount: number | null;
};

/** Values currently under consideration for the proposal's status. */
export function currentValues(p: ProposalLike | null): { type: ContractType | null; amount: number | null } {
  if (!p) return { type: null, amount: null };
  if (p.status === "approved") return { type: p.final_contract_type, amount: p.final_amount };
  if (["pending_manager_review", "reviewed_by_manager", "returned_to_manager", "pending_operations_review"].includes(p.status))
    return { type: p.manager_contract_type ?? p.proposed_contract_type, amount: p.manager_amount ?? p.proposed_amount };
  return { type: p.proposed_contract_type, amount: p.proposed_amount };
}

/** Actions the user may attempt. `isAssignedSourceur` = sourceur assigned to the demand. */
export function allowedActions(status: CompStatus | null, roles: readonly string[] | undefined | null, isAssignedSourceur: boolean): CompAction[] {
  const out: CompAction[] = [];
  const s = status ?? "draft";
  const canSubmit = (isAssignedSourceur && can(roles, "compensation.submit")) || can(roles, "compensation.review") || can(roles, "compensation.finalize");
  if (canSubmit && (s === "draft" || s === "returned_to_sourceur")) out.push("save_draft", "submit");
  if (can(roles, "compensation.review") && ["pending_manager_review", "reviewed_by_manager", "returned_to_manager"].includes(s))
    out.push("manager_review", "forward", "return_to_sourceur");
  if (can(roles, "compensation.finalize")) {
    if (s === "pending_operations_review") out.push("approve", "return_to_manager", "reject");
    if (s === "rejected") out.push("reopen");
    if (s === "approved") out.push("start_amendment");
  }
  return out;
}

export const COMMENT_REQUIRED: readonly CompAction[] = ["return_to_sourceur", "return_to_manager", "reject", "reopen", "start_amendment"];

export type ValidationError = "typeRequired" | "amountRequired" | "amountInvalid";
/** Client-side validation before submission (drafts may be incomplete). */
export function validateProposal(type: string | null | undefined, amount: string | number | null | undefined, forSubmit: boolean): ValidationError | null {
  const empty = amount === null || amount === undefined || amount === "";
  if (!empty) {
    const n = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return "amountInvalid";
  }
  if (!forSubmit) return null;
  if (!type || !(CONTRACT_TYPES as readonly string[]).includes(type)) return "typeRequired";
  if (empty) return "amountRequired";
  return null;
}

export function parseAmount(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Queue membership for each role workspace. */
export function inQueue(status: CompStatus, queue: "sourceur" | "hrbp" | "operations" | "approved"): boolean {
  switch (queue) {
    case "sourceur": return status === "draft" || status === "returned_to_sourceur";
    case "hrbp": return status === "pending_manager_review" || status === "reviewed_by_manager" || status === "returned_to_manager";
    case "operations": return status === "pending_operations_review";
    case "approved": return status === "approved";
  }
}
