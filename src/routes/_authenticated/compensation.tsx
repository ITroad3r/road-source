import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useMyRoles } from "@/hooks/useMyRoles";
import { can } from "@/lib/permissions";
import { currentValues, inQueue, type CompStatus } from "@/lib/compensation";
import { CompensationSummary, type ProposalSummary, useMoney } from "@/components/CompensationPanel";

export const Route = createFileRoute("/_authenticated/compensation")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Compensation approvals — RoadSource" },
    { name: "description", content: "Review and approve CDI, CDD and Freelance candidate compensation proposals by role." },
    { property: "og:title", content: "Compensation approvals — RoadSource" },
    { property: "og:description", content: "Sourceur, Sourcing Manager and Operations compensation queues." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CompensationPage,
});

type Queue = "sourceur" | "hrbp" | "operations" | "approved" | "all";
type Row = {
  id: string; demand_id: string; stage: string;
  demands: { id: string; title: string; assigned_to: string | null } | null;
  talent_hub_cvs: { id: string; full_name: string } | null;
  compensation_proposals: (ProposalSummary & { updated_at: string }) | (ProposalSummary & { updated_at: string })[] | null;
};

function CompensationPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const { user } = Route.useRouteContext();
  const { data: roles, isLoading: rolesLoading } = useMyRoles(user.id);
  const allowed = can(roles, "compensation.view");
  const queues = useMemo<Queue[]>(() => {
    const q: Queue[] = [];
    if (can(roles, "compensation.finalize")) q.push("operations");
    if (can(roles, "compensation.review")) q.push("hrbp");
    if (can(roles, "compensation.submit")) q.push("sourceur");
    q.push("approved", "all");
    return q;
  }, [roles]);
  const [tab, setTab] = useState<Queue | null>(null);
  const active = tab ?? queues[0] ?? "all";

  const { data, isLoading, error } = useQuery({
    queryKey: ["compensation-list"], enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("demand_candidates")
        .select("id, demand_id, stage, demands(id, title, assigned_to), talent_hub_cvs(id, full_name), compensation_proposals(id, status, version, currency, proposed_contract_type, proposed_amount, manager_contract_type, manager_amount, final_contract_type, final_amount, updated_at)")
        .order("updated_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  if (rolesLoading) return <div className="p-4 md:p-8 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t("common.loading")}</div>;
  if (!allowed) return <div className="p-4 md:p-8"><Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("comp.noAccess")}</CardContent></Card></div>;

  const rows = (data ?? []).map((r) => ({ ...r, comp: Array.isArray(r.compensation_proposals) ? r.compensation_proposals[0] ?? null : r.compensation_proposals }));
  const filtered = rows.filter((r) => {
    const st: CompStatus = r.comp?.status ?? "draft";
    if (active === "all") return true;
    if (active === "sourceur") {
      // Sourceurs see their assigned demands; HRBP/Operations submitters see candidatures with nothing submitted yet.
      const mine = r.demands?.assigned_to === user.id || !can(roles, "compensation.review") && !can(roles, "compensation.finalize") ? r.demands?.assigned_to === user.id : true;
      return mine && inQueue(st, "sourceur");
    }
    return r.comp ? inQueue(st, active) : false;
  });
  const counts = Object.fromEntries(queues.map((q) => [q, q === "all" ? rows.length : rows.filter((r) => {
    const st: CompStatus = r.comp?.status ?? "draft";
    if (q === "sourceur") return (r.demands?.assigned_to === user.id || can(roles, "compensation.review") || can(roles, "compensation.finalize")) && inQueue(st, "sourceur");
    return r.comp ? inQueue(st, q) : false;
  }).length]));

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6 text-primary" />{t("comp.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("comp.intro")}</p>
      </div>
      <Tabs value={active} onValueChange={(v) => setTab(v as Queue)}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList>
            {queues.map((q) => <TabsTrigger key={q} value={q}>{t(`comp.queues.${q}`)} <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{counts[q]}</Badge></TabsTrigger>)}
          </TabsList>
        </div>
      </Tabs>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t(`comp.queues.${active}`)}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />{t("comp.loading")}</div>
          : error ? <p role="alert" className="text-sm text-destructive">{t("comp.loadError")}</p>
          : filtered.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">{t("comp.queueEmpty")}</p>
          : (
            <ul className="divide-y">
              {filtered.map((r) => {
                const cur = currentValues(r.comp);
                return (
                  <li key={r.id} className="py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      {r.talent_hub_cvs ? <Link to="/talent-hub/$cvId" params={{ cvId: r.talent_hub_cvs.id }} className="font-medium hover:text-primary">{r.talent_hub_cvs.full_name}</Link> : <span>—</span>}
                      <div className="text-xs text-muted-foreground truncate">
                        {r.demands ? <Link to="/demands/$demandId" params={{ demandId: r.demands.id }} className="hover:underline">{r.demands.title}</Link> : "—"}
                        {r.comp?.updated_at && <> · {t("comp.updated")} {format(new Date(r.comp.updated_at), "dd/MM/yyyy")}</>}
                        {cur.amount != null && <> · {money(cur.amount, cur.type, r.comp?.currency)}</>}
                      </div>
                    </div>
                    <CompensationSummary dcId={r.id} candidateName={r.talent_hub_cvs?.full_name ?? ""} proposal={r.comp} roles={roles} isAssignedSourceur={r.demands?.assigned_to === user.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
