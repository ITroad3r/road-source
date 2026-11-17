import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, Gavel, Euro, FilePenLine, Trophy, Plus, AlertCircle, Users, Percent } from "lucide-react";
import { can } from "@/lib/permissions";
import { opsQueues, placementStats, hrbpKpis, conversion, ACTIVE_LIFECYCLES } from "@/lib/dashboard-kpis";
import { DispatchDemandDialog } from "@/components/DispatchDemandDialog";
import { StatCard, DashHeader, Panel } from "./shared";
import { useDashDemands, useDashCandidates, useDashFinancials, type CandRow } from "./data";

// Operations workspace: highlights pending decisions; approvals themselves stay on the demand page and /financials.
export function DirectorDashboard({ fullName, roles }: { fullName: string | null; roles: string[] }) {
  const { t } = useTranslation();
  const demandsQ = useDashDemands();
  const candsQ = useDashCandidates();
  const finsQ = useDashFinancials(roles);
  const demands = demandsQ.data ?? [];
  const cands = candsQ.data ?? [];
  const fins = finsQ.data ?? [];
  const q = opsQueues(cands, fins);
  const p = placementStats(cands);
  const h = hrbpKpis(cands);
  const conv = conversion(cands);
  const active = demands.filter((d) => ACTIVE_LIFECYCLES.includes(d.lifecycle));
  const unassigned = active.filter((d) => !d.assigned_to);
  const byId = new Map(cands.map((c) => [c.id, c]));
  const amendCands = q.amendments.map((f) => byId.get(f.demand_candidate_id)).filter(Boolean) as CandRow[];
  const loading = candsQ.isLoading || finsQ.isLoading;
  const canFin = can(roles, "financials.edit");
  const canManage = can(roles, "demands.manage");
  const v = (n: number) => (loading ? "…" : n);

  const list = (rows: CandRow[], emptyText: string, link: "demand" | "financials") => (
    rows.length === 0 ? <div className="p-6 text-sm text-muted-foreground text-center">{emptyText}</div> : (
      <ul className="divide-y">
        {rows.slice(0, 6).map((c) => (
          <li key={c.id}>
            {link === "financials" && canFin ? (
              <Link to="/financials" className="flex items-center justify-between gap-2 p-3 hover:bg-accent">
                <Row c={c} /><Badge variant="outline" className="shrink-0">{t("decisions.tjm.approve")}</Badge>
              </Link>
            ) : (
              <Link to="/demands/$demandId" params={{ demandId: c.demand_id }} className="flex items-center justify-between gap-2 p-3 hover:bg-accent">
                <Row c={c} /><Badge variant="outline" className="shrink-0">{t("dash.ops.decide")}</Badge>
              </Link>
            )}
          </li>
        ))}
      </ul>
    )
  );

  return (
    <div className="space-y-6">
      <DashHeader title={t("dash.ops.title", { name: fullName?.split(" ")[0] ?? "" })} subtitle={t("dash.ops.subtitle")}>
        {canFin && <Button asChild variant="outline"><Link to="/financials"><Euro className="h-4 w-4 mr-2" />{t("dash.links.tjm")}</Link></Button>}
        {canManage && <Button asChild><Link to="/demands/new"><Plus className="h-4 w-4 mr-2" />{t("dashboard.newDemand")}</Link></Button>}
      </DashHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t("dash.k.activeDemands")} value={demandsQ.isLoading ? "…" : active.length} icon={Briefcase} to={canManage ? "/demands" : undefined} hint={t("dash.ops.unassigned", { count: unassigned.length })} />
        <StatCard label={t("dash.k.awaitingFinal")} value={v(q.awaitingFinal.length)} icon={Gavel} accent={q.awaitingFinal.length ? "warning" : "primary"} />
        <StatCard label={t("dash.k.tjmAwaiting")} value={v(q.tjmAwaiting.length)} icon={Euro} accent={q.tjmAwaiting.length ? "warning" : "primary"} to={canFin ? "/financials" : undefined} />
        <StatCard label={t("dash.k.amendments")} value={v(q.amendments.length)} icon={FilePenLine} accent={q.amendments.length ? "danger" : "primary"} to={canFin ? "/financials" : undefined} />
        <StatCard label={t("dash.k.queue")} value={v(h.queue)} icon={Users} hint={t("dash.ops.qualHint", { q: h.qualified, r: h.rejected })} />
        <StatCard label={t("dash.k.placements")} value={v(p.placed)} icon={Trophy} accent="success" hint={t("dash.ops.approvedPlacements", { count: p.approvedPlacements })} />
        <StatCard label={t("dash.k.placementRate")} value={loading ? "…" : conv.placementRate == null ? t("dash.na") : `${conv.placementRate}%`} icon={Percent} hint={t("dash.k.placementRateHint")} />
        <StatCard label={t("dash.k.qualificationRate")} value={loading ? "…" : h.qualificationRate == null ? t("dash.na") : `${h.qualificationRate}%`} icon={Percent} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title={t("dash.ops.awaitingFinal")} icon={Gavel} loading={loading} error={candsQ.error ?? finsQ.error}>{list(q.awaitingFinal, t("dash.ops.none"), "demand")}</Panel>
        <Panel title={t("dash.ops.tjmAwaiting")} icon={Euro} loading={loading} error={candsQ.error ?? finsQ.error}>{list(q.tjmAwaiting, t("dash.ops.none"), "financials")}</Panel>
        <Panel title={t("dash.ops.amendments")} icon={FilePenLine} loading={loading} error={candsQ.error ?? finsQ.error}>{list(amendCands, t("dash.ops.none"), "financials")}</Panel>
      </div>

      <Panel title={t("dash.ops.unassignedTitle")} icon={AlertCircle} loading={demandsQ.isLoading} error={demandsQ.error} empty={unassigned.length === 0} emptyText={t("dash.ops.allAssigned")}
        action={<Link to="/demands" className="text-xs text-primary hover:underline shrink-0">{t("dash.links.all")}</Link>}>
        <ul className="divide-y">
          {unassigned.slice(0, 6).map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 p-3">
              <Link to="/demands/$demandId" params={{ demandId: d.id }} className="min-w-0 flex-1 hover:underline">
                <div className="text-sm font-medium truncate">{d.title}</div>
                <div className="text-xs text-muted-foreground truncate">{d.clients?.name ?? "—"}</div>
              </Link>
              {canManage && <DispatchDemandDialog demandId={d.id} demandTitle={d.title} currentAssignee={d.assigned_to} />}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Row({ c }: { c: CandRow }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium truncate">{c.talent_hub_cvs?.full_name ?? "—"}</div>
      <div className="text-xs text-muted-foreground truncate">{c.demands?.title ?? "—"}</div>
    </div>
  );
}
