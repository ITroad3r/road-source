// Mirrors the database rules in enforce_pipeline_decisions / enforce_tjm_approval.
export type QualificationStatus = "pending" | "qualified" | "rejected";
export type FinalDecision = "pending" | "approved" | "rejected";
export type TjmStatus = "draft" | "approved";

/** Returns why final approval is blocked, or null when allowed. tjm = null means no rate row. */
export function finalApprovalBlocker(q: QualificationStatus, tjm: TjmStatus | null): "notQualified" | "tjmNotApproved" | null {
  if (q !== "qualified") return "notQualified";
  if (tjm !== null && tjm !== "approved") return "tjmNotApproved";
  return null;
}
