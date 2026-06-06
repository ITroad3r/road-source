import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Euro, TrendingUp, Users, Pencil, Lock } from "lucide-react";
import { format } from "date-fns";
import { useMyRoles } from "@/hooks/useMyRoles";

export const Route = createFileRoute("/_authenticated/financials")({
  ssr: false,
  head: () => ({ meta: [{ title: "Financials — RoadSource" }] }),
  component: Financials,
});

type Row = {
  id: string;
  stage: string;
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
  }>;
};

function Financials() {
  const { user } = Route.useRouteContext();
  const { data: roles, isLoading: rolesLoading } = useMyRoles(user.id);
  const canView = !!roles?.some((r) => ["admin", "division_manager", "division_director", "ceo"].includes(r));
  const [stageFilter, setStageFilter] = useState<string>("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["financials-rows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_candidates")
        .select("id, stage, demand_id, cv_id, talent_hub_cvs(full_name, headline), demands(title, engagement, clients(name)), candidate_financials(id, client_rate, candidate_rate, margin, currency, placement_date, contract_duration_months, notes)")
        .in("stage", ["offer", "placed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const filtered = (rows ?? []).filter((r) => stageFilter === "all" || r.stage === stageFilter);

  const totals = filtered.reduce(
    (acc, r) => {
      const f = r.candidate_financials?.[0];
      const margin = Number(f?.margin ?? 0);
      const months = Number(f?.contract_duration_months ?? 0);
      if (r.stage === "placed") acc.placedCount++;
      acc.dailyMargin += margin;
      acc.totalContractMargin += margin * (months ? months * 20 : 0); // 20 working days/mo estimate
      return acc;
    },
    { placedCount: 0, dailyMargin: 0, totalContractMargin: 0 }
  );

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financials</h1>
          <p className="text-muted-foreground mt-1">Track rates, margins and placements across the pipeline.</p>
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All offer + placed</SelectItem>
            <SelectItem value="offer">Offer</SelectItem>
            <SelectItem value="placed">Placed</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat icon={Users} label="Placed candidates" value={String(totals.placedCount)} />
        <Stat icon={Euro} label="Daily margin (sum)" value={`€${totals.dailyMargin.toFixed(0)}`} />
        <Stat icon={TrendingUp} label="Est. contract margin" value={`€${totals.totalContractMargin.toFixed(0)}`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Pipeline financials</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Demand</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Client rate</TableHead>
                <TableHead className="text-right">Candidate rate</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead>Placement</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No candidates at offer or placed stage yet.</TableCell></TableRow>
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
                    <TableCell><Badge variant="outline" className="capitalize">{r.stage}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{f?.client_rate != null ? `€${f.client_rate}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{f?.candidate_rate != null ? `€${f.candidate_rate}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{f?.margin != null ? `€${f.margin}` : "—"}</TableCell>
                    <TableCell className="text-sm">{f?.placement_date ? format(new Date(f.placement_date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell><EditFinancials row={r} existing={f} /></TableCell>
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
