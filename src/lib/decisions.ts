// Mirrors the database rules in enforce_pipeline_decisions / enforce_tjm_approval.
export type QualificationStatus = "pending" | "qualified" | "rejected";
export type FinalDecision = "pending" | "approved" | "rejected";
export type TjmStatus = "draft" | "approved";

/** Returns why final approval is blocked, or null when allowed. tjm = null means no rate row. */
export function finalApprovalBlocker(q: QualificationStatus, tjm: TjmStatus | null): "notQualified" | "tjmNotApproved" | null {
  if (q !== "qualified") return "notQualified";
  if (tjm !== "approved") return "tjmNotApproved"; // no rate row also blocks
  return null;
}

/** TJM approval needs a qualified candidate; only grandfathered (pre-Stage 3) placements are exempt. */
export function canApproveTjmFor(q: QualificationStatus, legacyPlacement: boolean): boolean {
  return q === "qualified" || legacyPlacement;
}

/** Why a new candidature cannot move to "placed", or null. Legacy placements are never re-checked. */
export function placementBlocker(
  q: QualificationStatus, tjm: TjmStatus | null, decision: FinalDecision, legacyPlacement: boolean,
): "notQualified" | "tjmNotApproved" | "noFinalApproval" | null {
  if (legacyPlacement) return null;
  if (q !== "qualified") return "notQualified";
  if (tjm !== "approved") return "tjmNotApproved";
  if (decision !== "approved") return "noFinalApproval";
  return null;
}
