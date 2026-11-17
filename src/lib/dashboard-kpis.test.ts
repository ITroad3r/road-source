import { describe, it, expect } from "vitest";
import { sourceurKpis, hrbpKpis, opsQueues, financialKpis, conversion, placementStats, adminKpis, monthlyTrend, type Cand, type Fin, type Dem } from "./dashboard-kpis";
import { workspacesFor, resolveWorkspace, can } from "./permissions";

const S = "s1", S2 = "s2";
const c = (id: string, demand_id: string, by: string, stage: string, q: Cand["qualification_status"], d: Cand["final_decision"] = "pending", created_at = "2026-10-10"): Cand =>
  ({ id, demand_id, submitted_by: by, stage, qualification_status: q, final_decision: d, created_at });
// Mirrors db/seed.sql
const cands: Cand[] = [
  c("dc1", "d1", S, "submitted", "pending"), c("dc2", "d1", S, "screened", "qualified"), c("dc3", "d1", S, "submitted", "rejected"),
  c("dc4", "d2", S, "identified", "pending"), c("dc5", "d3", S2, "client_interview", "qualified"), c("dc6", "d3", S2, "submitted", "pending"),
  c("dc7", "d4", S2, "placed", "qualified", "approved"), c("dc8", "d4", S2, "placed", "qualified", "approved"),
];
const f = (id: string, cr: number, kr: number, st: Fin["tjm_status"], amend = false): Fin =>
  ({ demand_candidate_id: id, client_rate: cr, candidate_rate: kr, tjm_status: st, amendment_pending: amend, placement_date: null, contract_duration_months: null });
const fins: Fin[] = [f("dc2", 600, 450, "draft"), f("dc5", 700, 500, "approved"), f("dc7", 650, 480, "approved"), f("dc8", 620, 470, "draft", true)];
const d = (id: string, lifecycle: string, assigned_to: string | null, created_at = "2026-10-01"): Dem => ({ id, lifecycle, commercial_outcome: "pending", assigned_to, created_at });
const demands: Dem[] = [d("d1", "in_progress", S), d("d2", "open", S), d("d3", "in_progress", S2), d("d4", "filled", null), d("d5", "cancelled", S2)];

describe("Sourceur KPIs", () => {
  it("counts only the sourceur's own work", () => {
    expect(sourceurKpis(S, demands, cands)).toEqual({ activeDemands: 2, sourced: 4, submitted: 2, awaitingQualification: 2, qualified: 1, rejected: 1 });
  });
});
describe("HRBP KPIs", () => {
  it("queue = pending qualification on active candidatures", () => {
    expect(hrbpKpis(cands)).toEqual({ queue: 3, qualified: 4, rejected: 1, qualificationRate: 80 });
  });
});
describe("Operations queues", () => {
  const q = opsQueues(cands, fins);
  it("final approval only when qualified and TJM approved", () => expect(q.awaitingFinal.map((x) => x.id)).toEqual(["dc5"]));
  it("TJM awaiting includes missing/draft rates and re-approvals", () => expect(q.tjmAwaiting.map((x) => x.id)).toEqual(["dc2", "dc8"]));
  it("amendments after placement", () => expect(q.amendments.map((x) => x.demand_candidate_id)).toEqual(["dc8"]));
  it("placements", () => expect(placementStats(cands).approvedPlacements).toBe(2));
});
describe("CEO financial KPIs", () => {
  it("use approved TJM only", () => expect(financialKpis(fins)).toEqual({ approvedTjm: 2, avgDailyMargin: 185, avgClientRate: 675, marginRate: 27 }));
  it("unavailable (null) when nothing approved, never zero-invented", () => expect(financialKpis([f("x", 1, 1, "draft")]).avgDailyMargin).toBeNull());
  it("conversion", () => expect(conversion(cands).placementRate).toBe(25));
  it("monthly trend", () => {
    const t = monthlyTrend(demands, cands, new Date("2026-11-17T00:00:00Z"));
    expect(t).toHaveLength(6); expect(t[4]).toEqual({ month: "2026-10", demands: 5, candidatures: 8 });
  });
});
describe("Admin KPIs", () => {
  it("flags users without role and single admin", () => {
    const k = adminKpis([{ id: "a", created_at: "" }, { id: "b", created_at: "" }], [{ user_id: "a", role: "admin" }], ["admin", "ceo"]);
    expect(k.noRole.map((u) => u.id)).toEqual(["b"]); expect(k.singleAdmin).toBe(true); expect(k.byRole.admin).toBe(1);
  });
});
describe("Workspaces", () => {
  it("admin-only gets only the admin console", () => expect(workspacesFor(["admin"])).toEqual(["admin"]));
  it("admin never unlocks business workspaces or financials", () => {
    expect(workspacesFor(["admin", "hrbp"])).toEqual(["hrbp", "admin"]);
    expect(can(["admin", "hrbp"], "financials.view")).toBe(false);
  });
  it("multi-role users switch only between their own workspaces", () => {
    expect(resolveWorkspace(["hrbp", "operations"], "ceo")).toBe("operations");
    expect(resolveWorkspace(["hrbp", "operations"], "hrbp")).toBe("hrbp");
    expect(resolveWorkspace([], "ceo")).toBeNull();
  });
});
