// Mirrors the database rules in enforce_pipeline_decisions / enforce_tjm_approval.
export type QualificationStatus = "pending" | "qualified" | "rejected";
export type FinalDecision = "pending" | "approved" | "rejected";
export type TjmStatus = "draft" | "approved";

/** Returns why final approval is blocked, or null when allowed. tjm = null means no rate row. */
export type CompGate = { status: string; final_contract_type: string | null } | null | undefined;
export type GateBlocker = "tjmNotApproved" | "compensationNotApproved" | "commercialTjmRequired";
/** Mirrors public.compensation_gate_error: with a compensation proposal it must be approved
 *  (Freelance also needs the commercial TJM); legacy candidatures keep the approved-TJM rule. */
export function compensationGate(tjm: TjmStatus | null, comp?: CompGate): GateBlocker | null {
  if (!comp) return tjm === "approved" ? null : "tjmNotApproved";
  if (comp.status !== "approved") return "compensationNotApproved";
  if (comp.final_contract_type === "freelance" && tjm !== "approved") return "commercialTjmRequired";
  return null;
}
export function finalApprovalBlocker(q: QualificationStatus, tjm: TjmStatus | null, comp?: CompGate): "notQualified" | GateBlocker | null {
  if (q !== "qualified") return "notQualified";
  return compensationGate(tjm, comp);
}

/** TJM approval needs a qualified candidate; only grandfathered (pre-Stage 3) placements are exempt. */
export function canApproveTjmFor(q: QualificationStatus, legacyPlacement: boolean): boolean {
  return q === "qualified" || legacyPlacement;
}

/** Why a new candidature cannot move to "placed", or null. Legacy placements are never re-checked. */
export function placementBlocker(
  q: QualificationStatus, tjm: TjmStatus | null, decision: FinalDecision, legacyPlacement: boolean, comp?: CompGate,
): "notQualified" | GateBlocker | "noFinalApproval" | null {
  if (legacyPlacement) return null;
  if (q !== "qualified") return "notQualified";
  const g = compensationGate(tjm, comp); if (g) return g;
  if (decision !== "approved") return "noFinalApproval";
  return null;
}
