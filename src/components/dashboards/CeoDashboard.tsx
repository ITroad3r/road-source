import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { Briefcase, Activity, Trophy, Euro, Percent, CheckCircle2, Eye, Users } from "lucide-react";
import { financialKpis, conversion, hrbpKpis, pipelineDistribution, monthlyTrend, ACTIVE_LIFECYCLES, placementStats } from "@/lib/dashboard-kpis";
import { StatCard, DashHeader, Panel } from "./shared";
import { useDashDemands, useDashCandidates, useDashFinancials } from "./data";

const STAGES = ["identified", "contacted", "screened", "submitted", "client_interview", "offer", "placed", "rejected", "withdrawn"] as const;
const PERIODS = ["all", "30", "90", "365"] as const;

// CEO workspace: strictly read-only (no action buttons). Every figure is computed from rows RLS returns.
export function CeoDashboard({ fullName, roles }: { fullName: string | null; roles: string[] }) {
  const { t } = useTranslation();
  const demandsQ = useDashDemands();
  const candsQ = useDashCandidates();
  const finsQ = useDashFinancials(roles);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("all");
  const [client, setClient] = useState("all");
  const [demand, setDemand] = useState("all");

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of demandsQ.data ?? []) if (d.client_id) m.set(d.client_id, d.clients?.name ?? "—");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [demandsQ.data]);

  const { demands, cands, fins } = useMemo(() => {
    const since = period === "all" ? null : new Date(Date.now() - Number(period) * 864e5).toISOString();
    const ds = (demandsQ.data ?? []).filter((d) =>
      (client === "all" || d.client_id === client) && (demand === "all" || d.id === demand) && (!since || d.created_at >= since));
    const allIds = new Set((demandsQ.data ?? []).filter((d) => (client === "all" || d.client_id === client) && (demand === "all" || d.id === demand)).map((d) => d.id));
    const cs = (candsQ.data ?? []).filter((c) => allIds.has(c.demand_id) && (!since || c.created_at >= since));
    const cids = new Set(cs.map((c) => c.id));
    return { demands: ds, cands: cs, fins: (finsQ.data ?? []).filter((f) => cids.has(f.demand_candidate_id)) };
  }, [demandsQ.data, candsQ.data, finsQ.data, period, client, demand]);

  const loading = demandsQ.isLoading || candsQ.isLoading || finsQ.isLoading;
  const fk = financialKpis(fins);
  const conv = conversion(cands);
  const h = hrbpKpis(cands);
  const p = placementStats(cands);
  const dist = pipelineDistribution(cands, STAGES).map((r) => ({ ...r, label: t(`dash.stage.${r.stage}`) }));
  const trend = monthlyTrend(demands, cands, new Date());
  const v = (x: number | string) => (loading ? "…" : x);
  const na = t("dash.na");
  const money = (n: number | null) => (n == null ? na : `€${n.toLocaleString()}`);
  const demandOpts = (demandsQ.data ?? []).filter((d) => client === "all" || d.client_id === client);

  return (
    <div className="space-y-6">
      <DashHeader title={t("dash.ceo.title", { name: fullName?.split(" ")[0] ?? "" })} subtitle={t("dash.ceo.subtitle")}>
        <Badge variant="outline" className="gap-1 h-8"><Eye className="h-3.5 w-3.5" />{t("dash.readOnly")}</Badge>
      </DashHeader>

      <Card>
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Select value={period} onValueChange={(x) => setPeriod(x as typeof period)}>
            <SelectTrigger aria-label={t("dash.f.period")}><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((x) => <SelectItem key={x} value={x}>{t(`dash.f.p${x}`)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={client} onValueChange={(x) => { setClient(x); setDemand("all"); }}>
            <SelectTrigger aria-label={t("dash.f.client")}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("dash.f.allClients")}</SelectItem>{clients.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={demand} onValueChange={setDemand}>
            <SelectTrigger aria-label={t("dash.f.demand")}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("dash.f.allDemands")}</SelectItem>{demandOpts.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t("dash.k.totalDemands")} value={v(demands.length)} icon={Briefcase} hint={t("dash.ceo.activeHint", { count: demands.filter((d) => ACTIVE_LIFECYCLES.includes(d.lifecycle)).length })} />
        <StatCard label={t("dash.k.candidatures")} value={v(conv.candidatures)} icon={Users} />
        <StatCard label={t("dash.k.approvedPlacements")} value={v(p.approvedPlacements)} icon={Trophy} accent="success" />
        <StatCard label={t("dash.k.placementRate")} value={v(conv.placementRate == null ? na : `${conv.placementRate}%`)} icon={Percent} hint={t("dash.k.placementRateHint")} />
        <StatCard label={t("dash.k.qualificationRate")} value={v(h.qualificationRate == null ? na : `${h.qualificationRate}%`)} icon={CheckCircle2} hint={t("dash.ops.qualHint", { q: h.qualified, r: h.rejected })} />
        <StatCard label={t("dash.k.approvedTjm")} value={v(fk.approvedTjm)} icon={Euro} />
        <StatCard label={t("dash.k.avgDailyMargin")} value={v(money(fk.avgDailyMargin))} icon={Euro} accent="success" hint={fk.marginRate == null ? t("dash.ceo.approvedOnly") : t("dash.ceo.marginRate", { pct: fk.marginRate })} />
        <StatCard label={t("dash.k.avgClientRate")} value={v(money(fk.avgClientRate))} icon={Euro} hint={t("dash.ceo.approvedOnly")} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={t("dash.ceo.distribution")} icon={Activity} loading={loading} error={candsQ.error} empty={cands.length === 0}>
          <div className="h-64 p-2"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={dist} layout="vertical" margin={{ left: 10, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
              <YAxis type="category" dataKey="label" width={110} fontSize={11} stroke="var(--muted-foreground)" />
              <Tooltip /><Bar dataKey="count" name={t("dash.k.candidatures")} fill="var(--primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </Panel>
        <Panel title={t("dash.ceo.trend")} icon={Activity} loading={loading} error={demandsQ.error}>
          <div className="h-64 p-2"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ left: -10, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" fontSize={11} stroke="var(--muted-foreground)" />
              <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="linear" dataKey="demands" name={t("dash.k.totalDemands")} stroke="var(--primary)" strokeWidth={2} />
              <Line type="linear" dataKey="candidatures" name={t("dash.k.candidatures")} stroke="var(--chart-2)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer></div>
        </Panel>
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{t("dash.ceo.unavailableTitle")}</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">{t("dash.ceo.unavailableBody")}</CardContent></Card>
    </div>
  );
}
