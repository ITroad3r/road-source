import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UserCheck, Clock, CheckCircle2, XCircle, Briefcase, ListChecks, Percent } from "lucide-react";
import { can } from "@/lib/permissions";
import { hrbpKpis, qualificationQueue, qualificationByDemand } from "@/lib/dashboard-kpis";
import { StatCard, DashHeader, Panel, useAgo } from "./shared";
import { useDashDemands, useDashCandidates, useDashActivity } from "./data";
import { ActivityPanel } from "./SourcingDashboard";

// HRBP workspace: qualification queue + read-only demand visibility. No financial data is requested.
export function ManagerDashboard({ fullName, roles }: { fullName: string | null; roles: string[] }) {
  const { t } = useTranslation();
  const ago = useAgo();
  const demandsQ = useDashDemands();
  const candsQ = useDashCandidates();
  const activityQ = useDashActivity(["qualification", "qualification_revoked"]);
  const cands = candsQ.data ?? [];
  const k = hrbpKpis(cands);
  const queue = qualificationQueue(cands).slice().reverse(); // oldest first
  const byDemand = qualificationByDemand(cands);
  const demands = (demandsQ.data ?? []).filter((d) => byDemand.has(d.id));
  const loading = candsQ.isLoading;
  const canQualify = can(roles, "pipeline.qualify");

  return (
    <div className="space-y-6">
      <DashHeader title={t("dash.hrbp.title", { name: fullName?.split(" ")[0] ?? "" })} subtitle={t("dash.hrbp.subtitle")}>
        <Button asChild variant="outline"><Link to="/demands"><Briefcase className="h-4 w-4 mr-2" />{t("dash.links.demands")}</Link></Button>
      </DashHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t("dash.k.queue")} value={loading ? "…" : k.queue} icon={Clock} accent={k.queue ? "warning" : "primary"} />
        <StatCard label={t("dash.k.qualified")} value={loading ? "…" : k.qualified} icon={CheckCircle2} accent="success" />
        <StatCard label={t("dash.k.rejected")} value={loading ? "…" : k.rejected} icon={XCircle} accent="danger" />
        <StatCard label={t("dash.k.qualificationRate")} value={loading ? "…" : k.qualificationRate == null ? t("dash.na") : `${k.qualificationRate}%`} icon={Percent} hint={t("dash.k.qualificationRateHint")} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={t("dash.hrbp.queue")} icon={UserCheck} loading={loading} error={candsQ.error} empty={queue.length === 0} emptyText={t("dash.hrbp.queueEmpty")}>
          <ul className="divide-y">
            {queue.slice(0, 10).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.talent_hub_cvs?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.demands?.title} · {ago(c.created_at)}</div>
                </div>
                {canQualify && (
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link to="/demands/$demandId" params={{ demandId: c.demand_id }}>{t("dash.hrbp.review")}</Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t("dash.hrbp.byDemand")} icon={ListChecks} loading={loading || demandsQ.isLoading} error={candsQ.error ?? demandsQ.error} empty={demands.length === 0}>
          <ul className="divide-y">
            {demands.slice(0, 8).map((d) => {
              const r = byDemand.get(d.id)!; const total = r.pending + r.qualified + r.rejected;
              return (
                <li key={d.id}>
                  <Link to="/demands/$demandId" params={{ demandId: d.id }} className="block p-3 hover:bg-accent space-y-1.5">
                    <div className="flex justify-between gap-2 text-sm"><span className="font-medium truncate">{d.title}</span><span className="text-xs text-muted-foreground shrink-0">{r.qualified + r.rejected}/{total}</span></div>
                    <Progress value={total ? ((r.qualified + r.rejected) / total) * 100 : 0} className="h-1.5" />
                    <div className="flex gap-2 text-[11px] text-muted-foreground flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{t("dash.k.queue")}: {r.pending}</Badge>
                      <Badge variant="outline" className="text-[10px]">{t("dash.k.qualified")}: {r.qualified}</Badge>
                      <Badge variant="outline" className="text-[10px]">{t("dash.k.rejected")}: {r.rejected}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <ActivityPanel q={activityQ} title={t("dash.hrbp.activity")} />
    </div>
  );
}
