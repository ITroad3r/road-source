import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Search, Send, Users, Clock, CheckCircle2, XCircle, Activity } from "lucide-react";
import { can } from "@/lib/permissions";
import { sourceurKpis, ACTIVE_LIFECYCLES } from "@/lib/dashboard-kpis";
import { StatCard, DashHeader, Panel, statusColors, useAgo } from "./shared";
import { useDashDemands, useDashCandidates, useDashActivity } from "./data";

// Sourceur workspace: own assigned demands and own candidatures only. No financial data is requested.
export function SourcingDashboard({ userId, fullName, roles }: { userId: string; fullName: string | null; roles: string[] }) {
  const { t } = useTranslation();
  const ago = useAgo();
  const demandsQ = useDashDemands();
  const candsQ = useDashCandidates();
  const activityQ = useDashActivity(undefined, userId);
  const demands = (demandsQ.data ?? []).filter((d) => d.assigned_to === userId);
  const cands = candsQ.data ?? [];
  const k = sourceurKpis(userId, demands, cands);
  const mine = cands.filter((c) => c.submitted_by === userId);
  const active = demands.filter((d) => ACTIVE_LIFECYCLES.includes(d.lifecycle));
  const canHub = can(roles, "candidates.view");
  const loading = demandsQ.isLoading || candsQ.isLoading;

  return (
    <div className="space-y-6">
      <DashHeader title={t("dash.sourceur.title", { name: fullName?.split(" ")[0] ?? "" })} subtitle={t("dash.sourceur.subtitle")}>
        {canHub && <Button asChild variant="outline"><Link to="/talent-hub"><Search className="h-4 w-4 mr-2" />{t("dash.links.talentHub")}</Link></Button>}
        {can(roles, "candidates.edit") && <Button asChild><Link to="/talent-hub/new"><Users className="h-4 w-4 mr-2" />{t("dash.links.addCandidate")}</Link></Button>}
      </DashHeader>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label={t("dash.k.assignedDemands")} value={loading ? "…" : k.activeDemands} icon={Briefcase} to="/demands" />
        <StatCard label={t("dash.k.sourced")} value={loading ? "…" : k.sourced} icon={Users} />
        <StatCard label={t("dash.k.submitted")} value={loading ? "…" : k.submitted} icon={Send} />
        <StatCard label={t("dash.k.awaitingQualification")} value={loading ? "…" : k.awaitingQualification} icon={Clock} accent="warning" />
        <StatCard label={t("dash.k.qualified")} value={loading ? "…" : k.qualified} icon={CheckCircle2} accent="success" />
        <StatCard label={t("dash.k.rejected")} value={loading ? "…" : k.rejected} icon={XCircle} accent="danger" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2" title={t("dash.sourceur.assigned")} icon={Briefcase} loading={demandsQ.isLoading} error={demandsQ.error}
          empty={active.length === 0} emptyText={t("dash.sourceur.noAssigned")}
          action={<Link to="/demands" className="text-xs text-primary hover:underline shrink-0">{t("dash.links.all")}</Link>}>
          <ul className="divide-y">
            {active.slice(0, 8).map((d) => {
              const n = cands.filter((c) => c.demand_id === d.id).length;
              return (
                <li key={d.id}>
                  <Link to="/demands/$demandId" params={{ demandId: d.id }} className="flex items-center justify-between gap-3 p-3 hover:bg-accent">
                    <div className="min-w-0"><div className="text-sm font-medium truncate">{d.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{d.clients?.name ?? "—"} · {t("dash.nCandidates", { count: n })}</div></div>
                    <Badge variant="outline" className={statusColors[d.lifecycle] ?? ""}>{t(`demandStatus.${d.lifecycle}`)}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title={t("dash.sourceur.recentSubmissions")} icon={Send} loading={candsQ.isLoading} error={candsQ.error} empty={mine.length === 0} emptyText={t("dash.sourceur.noSubmissions")}>
          <ul className="divide-y">
            {mine.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link to="/demands/$demandId" params={{ demandId: c.demand_id }} className="block p-3 hover:bg-accent">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{c.talent_hub_cvs?.full_name ?? "—"}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{t(`decisions.q.${c.qualification_status}`)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{c.demands?.title} · {ago(c.created_at)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <ActivityPanel q={activityQ} title={t("dash.sourceur.activity")} />
    </div>
  );
}

export function ActivityPanel({ q, title }: { q: ReturnType<typeof useDashActivity>; title: string }) {
  const { t } = useTranslation();
  const ago = useAgo();
  const rows = q.data ?? [];
  return (
    <Panel title={title} icon={Activity} loading={q.isLoading} error={q.error} empty={rows.length === 0} emptyText={t("dash.noActivity")}>
      <ul className="divide-y">
        {rows.map((a) => (
          <li key={a.id} className="p-3 text-sm flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge variant="secondary" className="text-[10px] mr-2">{t(`dash.kind.${a.kind}`, { defaultValue: a.kind })}</Badge>
              {a.demand_id ? <Link to="/demands/$demandId" params={{ demandId: a.demand_id }} className="hover:underline break-words">{a.body ?? "—"}</Link> : <span className="break-words">{a.body ?? "—"}</span>}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{ago(a.created_at)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
