import { can } from "@/lib/permissions";
import { createFileRoute } from "@tanstack/react-router";
import { canApproveTjmFor } from "@/lib/decisions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Euro, TrendingUp, Users, Pencil, Lock, Percent, Wallet } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { useMyRoles } from "@/hooks/useMyRoles";

export const Route = createFileRoute("/_authenticated/financials")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Financials \u2014 RoadSource" },
    { name: "description", content: "Review RoadSource approved daily rates, revenue and margins according to your role." },
    { property: "og:title", content: "Financials \u2014 RoadSource" },
    { property: "og:description", content: "Review RoadSource approved daily rates, revenue and margins according to your role." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Financials,
});

type Row = {
  id: string;
  stage: string;
  qualification_status: "pending" | "qualified" | "rejected";
  final_decision: "pending" | "approved" | "rejected";
  legacy_placement: boolean;
  demand_id: string;
  cv_id: string;
  talent_hub_cvs: { full_name: string; headline: string | null } | null;
  demands: { title: string; engagement: string; clients: { name: string } | null } | null;
  candidate_financials: Array<{
    id: string;
    client_rate: number | null;
    candidate_rate: number | null;
    margin: number | null;
    currency: string | null;
    placement_date: string | null;
    contract_duration_months: number | null;
    notes: string | null;
    tjm_status: "draft" | "approved";
    tjm_approved_at: string | null;
    amendment_pending?: boolean;
  }>;
};

function Financials() {
  const { user } = Route.useRouteContext();
  const { t } = useTranslation();
  const { data: roles, isLoading: rolesLoading } = useMyRoles(user.id);
  const canView = can(roles, "financials.view");
  const canEdit = can(roles, "financials.edit");
  const canApproveTjm = can(roles, "tjm.approve");
  const qcFin = useQueryClient();
  async function approveTjm(id: string) {
    const row = rows?.find((r) => r.candidate_financials.some((f) => f.id === id));
    if (!canApproveTjm || !row || !canApproveTjmFor(row.qualification_status, row.legacy_placement, row.final_decision)) return;
    const { error } = await supabase.from("candidate_financials").update({ tjm_status: "approved" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("decisions.saved"));
    qcFin.invalidateQueries({ queryKey: ["financials-rows"] });
  }
  const [stageFilter, setStageFilter] = useState<string>("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["financials-rows"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_candidates")
        .select("id, stage, qualification_status, final_decision, legacy_placement, demand_id, cv_id, talent_hub_cvs(full_name, headline), demands(title, engagement, clients(name)), candidate_financials(id, client_rate, candidate_rate, margin, currency, placement_date, contract_duration_months, notes, tjm_status, tjm_approved_at, amendment_pending)")
        .or("and(qualification_status.eq.qualified,final_decision.eq.approved),stage.eq.placed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // candidate_financials is one-to-one (unique FK), so the API returns an object, not an array.
      // Normalize to an array so `[0]` works for both shapes.
      return (data ?? []).map((r) => {
        const fin = (r as { candidate_financials: unknown }).candidate_financials;
        return { ...r, candidate_financials: Array.isArray(fin) ? fin : fin ? [fin] : [] };
      }) as unknown as Row[];
    },
  });

  const filtered = (rows ?? []).filter((r) => stageFilter === "all" || (stageFilter === "qualified" ? r.qualification_status === "qualified" : r.stage === stageFilter));

  // Executive aggregates: revenue = client_rate * days, cost = candidate_rate * days, profit = margin * days
  // Days estimate: contract_duration_months * 20 working days
  const exec = filtered.reduce(
    (acc, r) => {
      const f = r.candidate_financials?.[0];
      if (!f) return acc;
      const months = Number(f.contract_duration_months ?? 0);
      const days = months ? months * 20 : 0;
      const revenue = Number(f.client_rate ?? 0) * days;
      const cost = Number(f.candidate_rate ?? 0) * days;
      const profit = Number(f.margin ?? 0) * days;
      if (r.stage === "placed") acc.placedCount++;
      acc.dailyMargin += Number(f.margin ?? 0);
      acc.totalRevenue += revenue;
      acc.totalCost += cost;
      acc.totalProfit += profit;
      // monthly bucket by placement_date
      if (f.placement_date && revenue > 0) {
        const key = format(new Date(f.placement_date), "yyyy-MM");
        acc.monthly[key] = (acc.monthly[key] ?? 0) + revenue;
      }
      // per-client share
      const cname = r.demands?.clients?.name ?? "—";
      if (revenue > 0) acc.byClient[cname] = (acc.byClient[cname] ?? 0) + revenue;
      return acc;
    },
    { placedCount: 0, dailyMargin: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, monthly: {} as Record<string, number>, byClient: {} as Record<string, number> }
  );

  const netMargin = exec.totalRevenue > 0 ? (exec.totalProfit / exec.totalRevenue) * 100 : 0;
  const monthlyData = Object.entries(exec.monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month: format(new Date(month + "-01"), "MMM yy"), revenue: Math.round(revenue) }));
  const clientData = Object.entries(exec.byClient)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const pieColors = ["var(--primary)", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

  if (rolesLoading) return <div className="p-4 md:p-8 text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (!canView) {
    return (
      <div className="p-4 md:p-8">
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t("common.restricted")}</h2>
            <p className="text-sm text-muted-foreground">{t("financials.restrictedBody")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("financials.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("financials.subtitle")}</p>
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("financials.allOfferPlaced")}</SelectItem>
            <SelectItem value="qualified">{t("financials.stageQualified")}</SelectItem>
            <SelectItem value="offer">{t("financials.stageOffer")}</SelectItem>
            <SelectItem value="placed">{t("financials.stagePlaced")}</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {/* Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={Euro} label={t("financials.totalRevenue")} value={`€${exec.totalRevenue.toLocaleString()}`} />
        <Stat icon={Wallet} label={t("financials.operationalCost")} value={`€${exec.totalCost.toLocaleString()}`} />
        <Stat icon={TrendingUp} label={t("financials.netProfit")} value={`€${exec.totalProfit.toLocaleString()}`} />
        <Stat icon={Percent} label={t("financials.netMargin")} value={`${netMargin.toFixed(1)}%`} />
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("financials.monthlyRevenue")}</CardTitle></CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">{t("financials.noRevenueData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip formatter={(v: number) => `€${v.toLocaleString()}`} contentStyle={{ background: "var(--background)", border: "1px solid var(--border)" }} />
                  <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("financials.revenueByClient")}</CardTitle></CardHeader>
          <CardContent>
            {clientData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">{t("financials.noClientRevenue")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={clientData} dataKey="value" nameKey="name" outerRadius={90} label={(e: { name: string }) => e.name}>
                    {clientData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `€${v.toLocaleString()}`} contentStyle={{ background: "var(--background)", border: "1px solid var(--border)" }} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat icon={Users} label={t("financials.placedCandidates")} value={String(exec.placedCount)} />
        <Stat icon={Euro} label={t("financials.dailyMarginSum")} value={`€${exec.dailyMargin.toFixed(0)}`} />
        <Stat icon={TrendingUp} label={t("financials.avgMargin")} value={exec.placedCount > 0 ? `€${(exec.totalProfit / exec.placedCount).toFixed(0)}` : "—"} />
      </div>


      <Card>
        <CardHeader><CardTitle>{t("financials.pipelineFinancials")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("financials.candidate")}</TableHead>
                <TableHead>{t("financials.demand")}</TableHead>
                <TableHead>{t("financials.stage")}</TableHead>
                <TableHead className="text-right">{t("financials.clientRate")}</TableHead>
                <TableHead className="text-right">{t("financials.candidateRate")}</TableHead>
                <TableHead className="text-right">{t("financials.margin")}</TableHead>
                <TableHead>TJM</TableHead>
                <TableHead>{t("financials.placement")}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{t("common.loading")}</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{t("financials.noPipeline")}</TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const f = r.candidate_financials?.[0];
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.talent_hub_cvs?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.talent_hub_cvs?.headline ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.demands?.title ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.demands?.clients?.name ?? ""} · <span className="capitalize">{r.demands?.engagement}</span></div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{t(`dash.stage.${r.stage}`)}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{f?.client_rate != null ? `€${f.client_rate}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{f?.candidate_rate != null ? `€${f.candidate_rate}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{f?.margin != null ? `€${f.margin}` : "—"}</TableCell>
                    <TableCell>
                      {f ? (
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline" className={f.tjm_status === "approved" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"}>
                            {f.tjm_status === "approved" && <Lock className="h-3 w-3 mr-1" />}{t(`decisions.tjm.${f.tjm_status}`)}
                          </Badge>
                          {f.amendment_pending && <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20 text-[10px]">{t("decisions.tjm.amendmentPending")}</Badge>}
                          {f.tjm_status === "approved" && f.tjm_approved_at && <span className="text-[10px] text-muted-foreground">{t("decisions.tjm.by")} {format(new Date(f.tjm_approved_at), "dd/MM/yyyy")}</span>}
                          {canApproveTjm && f.tjm_status === "draft" && f.client_rate != null && canApproveTjmFor(r.qualification_status, r.legacy_placement, r.final_decision) && (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => approveTjm(f.id)}>{t("decisions.tjm.approve")}</Button>
                          )}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{f?.placement_date ? format(new Date(f.placement_date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell>{canEdit ? <EditFinancials row={r} existing={f} /> : f?.tjm_status === "approved" ? <span title={t("decisions.tjm.locked")}><Lock className="h-4 w-4 text-muted-foreground" /></span> : null}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

type Existing = Row["candidate_financials"][number] | undefined;

function EditFinancials({ row, existing }: { row: Row; existing: Existing }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clientRate, setClientRate] = useState(existing?.client_rate?.toString() ?? "");
  const [candidateRate, setCandidateRate] = useState(existing?.candidate_rate?.toString() ?? "");
  const [duration, setDuration] = useState(existing?.contract_duration_months?.toString() ?? "");
  const [placement, setPlacement] = useState(existing?.placement_date ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? "EUR");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const cr = Number(clientRate || 0);
  const car = Number(candidateRate || 0);
  const margin = clientRate && candidateRate ? cr - car : null;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        demand_candidate_id: row.id,
        client_rate: clientRate ? Number(clientRate) : null,
        candidate_rate: candidateRate ? Number(candidateRate) : null,
        margin,
        currency,
        placement_date: placement || null,
        contract_duration_months: duration ? Number(duration) : null,
        notes: notes || null,
      };
      if (existing) {
        const { error } = await supabase.from("candidate_financials").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("candidate_financials").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financials-rows"] });
      toast.success("Financials saved");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.talent_hub_cvs?.full_name} — {row.demands?.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Client rate</Label><Input type="number" min={0} value={clientRate} onChange={(e) => setClientRate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Candidate rate</Label><Input type="number" min={0} value={candidateRate} onChange={(e) => setCandidateRate(e.target.value)} /></div>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">Computed margin</span>
            <span className="font-medium tabular-nums">{margin != null ? `${currency === "EUR" ? "€" : currency + " "}${margin}` : "—"}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="CHF">CHF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Duration (months)</Label><Input type="number" min={0} max={120} value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
            <div className="space-y-2"><Label>Placement date</Label><Input type="date" value={placement} onChange={(e) => setPlacement(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
