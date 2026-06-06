import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/demands/$demandId/edit")({
  ssr: false,
  head: () => ({ meta: [{ title: "Edit Demand — RoadSource" }] }),
  component: EditDemand,
});

const demandSchema = z.object({
  client_id: z.string().uuid({ message: "Select a client" }),
  title: z.string().trim().min(3, "Title too short").max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  engagement: z.enum(["freelance", "permanent"]),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  budget_min: z.string().optional(),
  budget_max: z.string().optional(),
  start_date: z.string().optional().or(z.literal("")),
  priority: z.string(),
  assigned_to: z.string().optional().or(z.literal("")),
  status: z.enum(["open", "sourcing", "submitted", "interview", "offer", "placed", "closed", "lost"]),
});

const DEMAND_STATUSES = ["open", "sourcing", "submitted", "interview", "offer", "placed", "closed", "lost"] as const;

function EditDemand() {
  const { demandId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: demand, isLoading } = useQuery({
    queryKey: ["demand", demandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("*")
        .eq("id", demandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, industry").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: users } = useQuery({
    queryKey: ["profiles-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [engagement, setEngagement] = useState<"freelance" | "permanent">("freelance");
  const [location, setLocation] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [startDate, setStartDate] = useState("");
  const [priority, setPriority] = useState("3");
  const [assignedTo, setAssignedTo] = useState("");
  const [status, setStatus] = useState<(typeof DEMAND_STATUSES)[number]>("open");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!demand) return;
    setClientId(demand.client_id ?? "");
    setTitle(demand.title ?? "");
    setDescription(demand.description ?? "");
    setEngagement(demand.engagement as "freelance" | "permanent");
    setLocation(demand.location ?? "");
    setBudgetMin(demand.budget_min != null ? String(demand.budget_min) : "");
    setBudgetMax(demand.budget_max != null ? String(demand.budget_max) : "");
    setStartDate(demand.start_date ? demand.start_date.slice(0, 10) : "");
    setPriority(String(demand.priority ?? 3));
    setAssignedTo(demand.assigned_to ?? "");
    setStatus(demand.status as (typeof DEMAND_STATUSES)[number]);
    setSkills(demand.required_skills ?? []);
  }, [demand]);

  function addSkill() {
    const s = skillInput.trim();
    if (!s || skills.includes(s) || s.length > 50) return;
    setSkills([...skills, s]);
    setSkillInput("");
  }

  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof demandSchema>) => {
      const { error } = await supabase
        .from("demands")
        .update({
          client_id: values.client_id,
          title: values.title.trim(),
          description: values.description?.trim() || null,
          engagement: values.engagement,
          required_skills: skills,
          location: values.location?.trim() || null,
          budget_min: values.budget_min ? Number(values.budget_min) : null,
          budget_max: values.budget_max ? Number(values.budget_max) : null,
          start_date: values.start_date || null,
          priority: Number(values.priority),
          assigned_to: values.assigned_to || null,
          status: values.status,
        })
        .eq("id", demandId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demand", demandId] });
      qc.invalidateQueries({ queryKey: ["demands", "list"] });
      toast.success("Demand updated");
      navigate({ to: "/demands/$demandId", params: { demandId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = demandSchema.safeParse({
      client_id: clientId,
      title,
      description,
      engagement,
      location,
      budget_min: budgetMin,
      budget_max: budgetMax,
      start_date: startDate,
      priority,
      assigned_to: assignedTo,
      status,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    updateMutation.mutate(parsed.data);
    setSubmitting(false);
  }

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!demand) return <div className="p-8">Demand not found.</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/demands/$demandId" params={{ demandId }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to demand
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight mt-2">Edit Demand</h1>
        <p className="text-muted-foreground mt-1">Update the details below.</p>
      </div>

      <form onSubmit={submit}>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.industry ? ` · ${c.industry}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Senior React Engineer — 6 months" />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={5} placeholder="Mission context, team, must-haves…" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Engagement *</Label>
                <Select value={engagement} onValueChange={(v) => setEngagement(v as "freelance" | "permanent")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freelance">Freelance</SelectItem>
                    <SelectItem value="permanent">Permanent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — Critical</SelectItem>
                    <SelectItem value="2">2 — High</SelectItem>
                    <SelectItem value="3">3 — Normal</SelectItem>
                    <SelectItem value="4">4 — Low</SelectItem>
                    <SelectItem value="5">5 — Nice to have</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as (typeof DEMAND_STATUSES)[number])}>
                  <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEMAND_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Required skills</Label>
              <div className="flex gap-2">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                  placeholder="Type a skill and press Enter"
                  maxLength={50}
                />
                <Button type="button" variant="outline" onClick={addSkill}>Add</Button>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {skills.map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1">
                      {s}
                      <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Paris / Remote / Hybrid" />
              </div>
              <div className="space-y-2">
                <Label>Budget min (€)</Label>
                <Input type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Budget max (€)</Label>
                <Input type="number" min={0} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    {users?.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/demands/$demandId", params: { demandId } })}>Cancel</Button>
              <Button type="submit" disabled={submitting || updateMutation.isPending}>
                {submitting || updateMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
