import { can } from "./permissions";

export const PIPELINE_STAGES = ["identified", "contacted", "screened", "submitted", "client_interview", "offer", "placed", "rejected", "withdrawn"] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];
export type WorkflowCandidate = { stage: string; qualification_status: string; final_decision: string };

/** All columns remain visible; this only restricts movements, never reads. */
export function canMoveCandidate(roles: readonly string[] | undefined, candidate: WorkflowCandidate, target: PipelineStage): boolean {
  if (!can(roles, "candidates.edit")) return false;
  if (target === candidate.stage) return true;
  if (target === "withdrawn") return candidate.stage !== "placed";
  if (target === "rejected") return can(roles, "pipeline.qualify") || can(roles, "pipeline.finalDecision");
  if (["submitted", "client_interview", "offer", "placed"].includes(target) &&
      (candidate.qualification_status !== "qualified" || candidate.final_decision !== "approved")) return false;
  if (roles?.includes("hrbp") || roles?.includes("operations")) return true;
  const current = PIPELINE_STAGES.indexOf(candidate.stage as PipelineStage);
  return current >= 0 && current < 6 && PIPELINE_STAGES[current + 1] === target;
}

export function readyForHrbp(stage: string): boolean {
  return ["screened", "submitted", "client_interview", "offer"].includes(stage);
}