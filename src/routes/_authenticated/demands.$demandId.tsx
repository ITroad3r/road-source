import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Building2, MapPin, Calendar, Plus, Search, Trash2, User, Pencil, LayoutGrid, List, Send } from "lucide-react";
import { format } from "date-fns";
import { ActivityLog } from "@/components/ActivityLog";
import { LIFECYCLE_VALUES, LIFECYCLE_LABEL, LIFECYCLE_COLORS, OUTCOME_VALUES, OUTCOME_LABEL, OUTCOME_COLORS, type Lifecycle, type Outcome } from "@/lib/demand-status";
import { PipelineKanban, type KanbanStage } from "@/components/PipelineKanban";
import { SendPackageDialog } from "@/components/SendPackageDialog";

export const Route = createFileRoute("/_authenticated/demands/$demandId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Demand — RoadSource" }] }),
  component: DemandDetail,
});

const STAGES = [
  "identified",
  "contacted",
  "screened",
  "submitted",
  "client_interview",
  "offer",
  "placed",
  "rejected",
  "withdrawn",
] as const;
type Stage = (typeof STAGES)[number];



const stageColors: Record<string, string> = {
  identified: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  contacted: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  screened: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  submitted: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  client_interview: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  offer: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  placed: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  withdrawn: "bg-muted text-muted-foreground border-border",
};

function DemandDetail() {
  const { demandId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [packageOpen, setPackageOpen] = useState(false);

  const { data: demand, isLoading } = useQuery({
    queryKey: ["demand", demandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("*, clients(name, industry, contact_name, contact_email)")
        .eq("id", demandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["demand-candidates", demandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_candidates")
        .select("id, stage, notes, created_at, cv_id, talent_hub_cvs(id, full_name, headline, email, skills, years_experience, seniority, location, daily_rate, salary_expectation, cv_url, linkedin_url)")
        .eq("demand_id", demandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const { error } = await supabase.from("demand_candidates").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demand-candidates", demandId] });
      toast.success("Stage updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCandidate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("demand_candidates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demand-candidates", demandId] });
      toast.success("Candidate removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLifecycle = useMutation({
    mutationFn: async (lifecycle: Lifecycle) => {
      const { error } = await supabase.from("demands").update({ lifecycle }).eq("id", demandId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demand", demandId] });
      toast.success("Lifecycle updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateOutcome = useMutation({
    mutationFn: async ({ outcome, lost_reason }: { outcome: Outcome; lost_reason?: string | null }) => {
      const { error } = await supabase
        .from("demands")
        .update({
          commercial_outcome: outcome,
          lost_reason: outcome === "lost" ? (lost_reason ?? null) : null,
        })
        .eq("id", demandId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demand", demandId] });
      toast.success("Outcome updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!demand) return <div className="p-8">Demand not found.</div>;

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Back to My Demands</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-2xl">{demand.title}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {demand.clients?.name ?? "—"}
                {demand.clients?.industry && <span className="opacity-60">· {demand.clients.industry}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button asChild variant="outline" size="sm">
                <Link to="/demands/$demandId/edit" params={{ demandId }}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Link>
              </Button>
              <Select value={demand.lifecycle} onValueChange={(v) => updateLifecycle.mutate(v as Lifecycle)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIFECYCLE_VALUES.map((s) => <SelectItem key={s} value={s}>{LIFECYCLE_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={demand.commercial_outcome}
                onValueChange={(v) => {
                  const outcome = v as Outcome;
                  if (outcome === "lost") {
                    const reason = window.prompt("Reason demand was lost:", demand.lost_reason ?? "");
                    if (!reason || !reason.trim()) return;
                    updateOutcome.mutate({ outcome, lost_reason: reason.trim() });
                  } else {
                    updateOutcome.mutate({ outcome });
                  }
                }}
              >
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOME_VALUES.map((s) => <SelectItem key={s} value={s}>{OUTCOME_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Badge variant="outline" className={LIFECYCLE_COLORS[demand.lifecycle as Lifecycle]}>{LIFECYCLE_LABEL[demand.lifecycle as Lifecycle]}</Badge>
              <Badge variant="outline" className={OUTCOME_COLORS[demand.commercial_outcome as Outcome]}>{OUTCOME_LABEL[demand.commercial_outcome as Outcome]}</Badge>
              {demand.is_rfo && (
                <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
                  RFO{demand.rfo_deadline ? ` · due ${format(new Date(demand.rfo_deadline), "MMM d, HH:mm")}` : ""}
                </Badge>
              )}
              <Badge variant="secondary" className="capitalize">{demand.engagement}</Badge>
              {demand.positions_count > 1 && <Badge variant="outline">{demand.positions_count} positions</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {demand.commercial_outcome === "lost" && demand.lost_reason && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <span className="font-medium text-red-700 dark:text-red-300">Lost reason: </span>
              <span className="text-red-700 dark:text-red-300">{demand.lost_reason}</span>
            </div>
          )}
          {demand.description && <p className="text-sm whitespace-pre-wrap">{demand.description}</p>}
          <div className="flex flex-wrap gap-1.5">
            {demand.required_skills?.map((s: string) => (
              <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground pt-1">
            {demand.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{demand.location}</span>}
            {(demand.budget_min || demand.budget_max) && (
              <span>{demand.engagement === "freelance" ? "TJM" : "Salary"}: {demand.budget_min ?? "?"} – {demand.budget_max ?? "?"}</span>
            )}
            {demand.start_date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Start {format(new Date(demand.start_date), "MMM d, yyyy")}</span>}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-semibold">Pipeline ({candidates?.length ?? 0})</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-md border bg-background">
            <Button
              variant={view === "kanban" ? "default" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setView("kanban")}
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Kanban
            </Button>
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setView("list")}
            >
              <List className="h-3.5 w-3.5 mr-1" /> List
            </Button>
          </div>
          <Button variant="outline" onClick={() => setPackageOpen(true)} disabled={!candidates?.length}>
            <Send className="h-4 w-4 mr-1" /> Send Package
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Add candidate</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Add candidate from Talent Hub</DialogTitle></DialogHeader>
              <AddCandidatePicker
                demandId={demandId}
                existingCvIds={new Set((candidates ?? []).map((c) => c.cv_id))}
                onAdded={() => {
                  qc.invalidateQueries({ queryKey: ["demand-candidates", demandId] });
                  setAddOpen(false);
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {view === "kanban" ? (
        <PipelineKanban
          candidates={(candidates ?? []).map((dc) => ({
            id: dc.id,
            stage: dc.stage as KanbanStage,
            cv: dc.talent_hub_cvs
              ? {
                  id: dc.talent_hub_cvs.id,
                  full_name: dc.talent_hub_cvs.full_name,
                  headline: dc.talent_hub_cvs.headline,
                  seniority: dc.talent_hub_cvs.seniority,
                  daily_rate: dc.talent_hub_cvs.daily_rate,
                  skills: dc.talent_hub_cvs.skills,
                }
              : null,
          }))}
          onStageChange={(id, stage) => updateStage.mutate({ id, stage: stage as Stage })}
          onRemove={(id) => removeCandidate.mutate(id)}
        />
      ) : (
        <div className="space-y-3">
          {candidates?.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No candidates yet. Add one from the Talent Hub.</CardContent></Card>
          )}
          {candidates?.map((dc) => {
            const cv = dc.talent_hub_cvs;
            if (!cv) return null;
            return (
              <Card key={dc.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link to="/talent-hub/$cvId" params={{ cvId: cv.id }} className="font-semibold hover:text-primary transition-colors">{cv.full_name}</Link>
                          <div className="text-sm text-muted-foreground">{cv.headline ?? "—"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select value={dc.stage} onValueChange={(v) => updateStage.mutate({ id: dc.id, stage: v as Stage })}>
                            <SelectTrigger className="w-44">
                              <Badge variant="outline" className={stageColors[dc.stage]}>{dc.stage.replace("_", " ")}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" onClick={() => removeCandidate.mutate(dc.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {cv.skills && cv.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {cv.skills.slice(0, 10).map((s: string) => (
                            <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {cv.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{cv.location}</span>}
                        {cv.years_experience != null && <span>{cv.years_experience} yrs</span>}
                        {cv.seniority && <span className="capitalize">{cv.seniority}</span>}
                        {cv.daily_rate != null && <span>TJM: €{cv.daily_rate}</span>}
                        {cv.salary_expectation != null && <span>Salary: €{cv.salary_expectation}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <SendPackageDialog
        open={packageOpen}
        onOpenChange={setPackageOpen}
        demand={{
          id: demand.id,
          title: demand.title,
          clients: demand.clients
            ? {
                name: demand.clients.name,
                contact_email: demand.clients.contact_email,
                contact_name: demand.clients.contact_name,
              }
            : null,
        }}
        candidates={(candidates ?? []).map((dc) => ({
          id: dc.id,
          stage: dc.stage,
          cv: dc.talent_hub_cvs
            ? {
                id: dc.talent_hub_cvs.id,
                full_name: dc.talent_hub_cvs.full_name,
                headline: dc.talent_hub_cvs.headline,
                seniority: dc.talent_hub_cvs.seniority,
                years_experience: dc.talent_hub_cvs.years_experience,
                daily_rate: dc.talent_hub_cvs.daily_rate,
                location: dc.talent_hub_cvs.location,
                skills: dc.talent_hub_cvs.skills,
                cv_url: dc.talent_hub_cvs.cv_url,
                linkedin_url: dc.talent_hub_cvs.linkedin_url,
              }
            : null,
        }))}
      />

      <ActivityLog scope={{ demandId }} currentUserId={user.id} />
    </div>
  );
}

function AddCandidatePicker({
  demandId,
  existingCvIds,
  onAdded,
}: {
  demandId: string;
  existingCvIds: Set<string>;
  onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: cvs } = useQuery({
    queryKey: ["talent-hub-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talent_hub_cvs")
        .select("id, full_name, headline, skills, location, seniority")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (cvs ?? []).filter((c) => {
      if (existingCvIds.has(c.id)) return false;
      if (!term) return true;
      const hay = [c.full_name, c.headline ?? "", c.location ?? "", (c.skills ?? []).join(" ")].join(" ").toLowerCase();
      return hay.includes(term);
    }).slice(0, 25);
  }, [cvs, q, existingCvIds]);

  async function attach() {
    if (!selectedId) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("demand_candidates").insert({
      demand_id: demandId,
      cv_id: selectedId,
      stage: "identified",
      notes: notes || null,
      submitted_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Candidate added to pipeline");
    onAdded();
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search Talent Hub…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="max-h-72 overflow-auto border rounded-md divide-y">
        {filtered.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">No matches</div>}
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedId(c.id)}
            className={`w-full text-left p-3 hover:bg-accent transition ${selectedId === c.id ? "bg-accent" : ""}`}
          >
            <div className="font-medium text-sm">{c.full_name}</div>
            <div className="text-xs text-muted-foreground">{c.headline ?? "—"} {c.location ? `· ${c.location}` : ""}</div>
          </button>
        ))}
      </div>
      <Textarea placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      <Button onClick={attach} disabled={!selectedId} className="w-full">Add to pipeline</Button>
    </div>
  );
}
