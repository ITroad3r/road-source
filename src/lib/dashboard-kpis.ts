// Pure KPI definitions for role dashboards. Inputs are rows the caller's RLS already allows.
export type Cand = {
  id: string; demand_id: string; stage: string; submitted_by: string | null; created_at: string;
  qualification_status: "pending" | "qualified" | "rejected";
  final_decision: "pending" | "approved" | "rejected";
};
export type Fin = {
  demand_candidate_id: string; client_rate: number | null; candidate_rate: number | null;
  tjm_status: "draft" | "approved"; amendment_pending: boolean; placement_date: string | null;
  contract_duration_months: number | null;
};
export type Dem = { id: string; lifecycle: string; commercial_outcome: string; assigned_to: string | null; client_id?: string | null; created_at: string };

export const ACTIVE_LIFECYCLES = ["open", "in_progress"];
export const CLOSED_STAGES = ["rejected", "withdrawn"];
export const SUBMITTED_STAGES = ["submitted", "client_interview", "offer", "placed"];

const isActiveCand = (c: Cand) => !CLOSED_STAGES.includes(c.stage);
export const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 100) : null);

export function sourceurKpis(userId: string, demands: Dem[], cands: Cand[]) {
  const mine = cands.filter((c) => c.submitted_by === userId);
  return {
    activeDemands: demands.filter((d) => d.assigned_to === userId && ACTIVE_LIFECYCLES.includes(d.lifecycle)).length,
    sourced: mine.length,
    submitted: mine.filter((c) => SUBMITTED_STAGES.includes(c.stage)).length,
    awaitingQualification: qualificationQueue(mine).length,
    qualified: mine.filter((c) => c.qualification_status === "qualified").length,
    rejected: mine.filter((c) => c.qualification_status === "rejected").length,
  };
}

export function qualificationQueue<T extends Cand>(cands: T[]): T[] {
  return cands.filter((c) => c.qualification_status === "pending" && ["screened", "submitted", "client_interview", "offer"].includes(c.stage));
}

export function hrbpKpis(cands: Cand[]) {
  const qualified = cands.filter((c) => c.qualification_status === "qualified").length;
  const rejected = cands.filter((c) => c.qualification_status === "rejected").length;
  return { queue: qualificationQueue(cands).length, qualified, rejected, qualificationRate: pct(qualified, qualified + rejected) };
}

/** Per demand: pending / qualified / rejected counts. */
export function qualificationByDemand(cands: Cand[]) {
  const m = new Map<string, { pending: number; qualified: number; rejected: number }>();
  for (const c of cands) {
    const r = m.get(c.demand_id) ?? { pending: 0, qualified: 0, rejected: 0 };
    r[c.qualification_status]++;
    m.set(c.demand_id, r);
  }
  return m;
}

export function opsQueues<T extends Cand>(cands: T[], fins: Fin[]) {
  const fin = new Map(fins.map((f) => [f.demand_candidate_id, f]));
  const live = cands.filter((c) => c.qualification_status === "qualified" && isActiveCand(c));
  return {
    awaitingFinal: live.filter((c) => c.final_decision === "pending" && c.stage !== "placed"),
    tjmAwaiting: live.filter((c) => c.final_decision === "approved" && (fin.get(c.id)?.tjm_status ?? "draft") === "draft"),
    amendments: fins.filter((f) => f.amendment_pending),
  };
}

export function placementStats(cands: Cand[], now = new Date()) {
  const placed = cands.filter((c) => c.stage === "placed");
  return { placed: placed.length, approvedPlacements: placed.filter((c) => c.final_decision === "approved").length, now };
}

/** Financial KPIs from APPROVED TJM rows only; null when no approved row exists (shown as "unavailable"). */
export function financialKpis(fins: Fin[]) {
  const ok = fins.filter((f) => f.tjm_status === "approved" && f.client_rate != null && f.candidate_rate != null);
  if (ok.length === 0) return { approvedTjm: 0, avgDailyMargin: null, avgClientRate: null, marginRate: null };
  const margin = ok.reduce((s, f) => s + (f.client_rate! - f.candidate_rate!), 0);
  const client = ok.reduce((s, f) => s + f.client_rate!, 0);
  return {
    approvedTjm: ok.length,
    avgDailyMargin: Math.round(margin / ok.length),
    avgClientRate: Math.round(client / ok.length),
    marginRate: pct(margin, client),
  };
}

export function conversion(cands: Cand[]) {
  return { candidatures: cands.length, placementRate: pct(cands.filter((c) => c.stage === "placed").length, cands.length) };
}

export function pipelineDistribution(cands: Cand[], stages: readonly string[]) {
  return stages.map((s) => ({ stage: s, count: cands.filter((c) => c.stage === s).length }));
}

/** Last n months (oldest first) as yyyy-MM keys with demand and candidature counts. */
export function monthlyTrend(demands: Dem[], cands: Cand[], now: Date, n = 6) {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys.map((k) => ({
    month: k,
    demands: demands.filter((d) => d.created_at.slice(0, 7) === k).length,
    candidatures: cands.filter((c) => c.created_at.slice(0, 7) === k).length,
  }));
}

export type AdminUser = { id: string; created_at: string };
export type RoleRow = { user_id: string; role: string };
export function adminKpis(users: AdminUser[], roles: RoleRow[], allRoles: readonly string[]) {
  const byRole = Object.fromEntries(allRoles.map((r) => [r, new Set(roles.filter((x) => x.role === r).map((x) => x.user_id)).size]));
  const withRole = new Set(roles.filter((r) => allRoles.includes(r.role)).map((r) => r.user_id));
  const noRole = users.filter((u) => !withRole.has(u.id));
  return { total: users.length, byRole, noRole, singleAdmin: (byRole.admin ?? 0) <= 1 };
}
