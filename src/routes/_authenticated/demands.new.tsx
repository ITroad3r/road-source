import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/demands/new")({
  ssr: false,
  head: () => ({ meta: [{ title: "New Demand — RoadSource" }] }),
  component: NewDemand,
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
  is_rfo: z.boolean(),
  rfo_deadline: z.string().optional().or(z.literal("")),
  positions_count: z.string(),
});

function NewDemand() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();

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
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [isRfo, setIsRfo] = useState(false);
  const [rfoDeadline, setRfoDeadline] = useState("");
  const [positionsCount, setPositionsCount] = useState("1");

  const { data: clients, refetch: refetchClients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, industry").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: users } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_team_members");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });

  function addSkill() {
    const s = skillInput.trim();
    if (!s || skills.includes(s) || s.length > 50) return;
    setSkills([...skills, s]);
    setSkillInput("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = demandSchema.safeParse({
      client_id: clientId, title, description, engagement, location,
      budget_min: budgetMin, budget_max: budgetMax, start_date: startDate, priority, assigned_to: assignedTo,
      is_rfo: isRfo, rfo_deadline: rfoDeadline, positions_count: positionsCount,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const positions = Math.max(1, Number(positionsCount) || 1);
    setSubmitting(true);
    const { data, error } = await supabase.from("demands").insert({
      client_id: clientId,
      title: title.trim(),
      description: description.trim() || null,
      engagement,
      required_skills: skills,
      location: location.trim() || null,
      budget_min: budgetMin ? Number(budgetMin) : null,
      budget_max: budgetMax ? Number(budgetMax) : null,
      start_date: startDate || null,
      priority: Number(priority),
      assigned_to: assignedTo || null,
      created_by: user.id,
      status: "open",
      is_rfo: isRfo,
      rfo_deadline: isRfo && rfoDeadline ? new Date(rfoDeadline).toISOString() : null,
      positions_count: positions,
    }).select("id").single();
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Demand created");
    navigate({ to: "/demands/$demandId", params: { demandId: data.id } });
  }

  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">New Demand</h1>
        <p className="text-muted-foreground mt-1">Create a client request and assign it to a sourcing teammate.</p>
      </header>

      <form onSubmit={submit}>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
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
              <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline"><Plus className="h-4 w-4 mr-1" /> New client</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
                  <NewClientForm
                    createdBy={user.id}
                    onCreated={async (id) => {
                      await refetchClients();
                      setClientId(id);
                      setNewClientOpen(false);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Senior React Engineer — 6 months" />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={5} placeholder="Mission context, team, must-haves…" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Positions to fill</Label>
                <Input type="number" min={1} max={50} value={positionsCount} onChange={(e) => setPositionsCount(e.target.value)} />
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

            <div className="rounded-md border p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Request For Offer (RFO)</Label>
                  <p className="text-xs text-muted-foreground">Competitive bid — multiple CVs sent, client picks one.</p>
                </div>
                <Switch checked={isRfo} onCheckedChange={setIsRfo} />
              </div>
              {isRfo && (
                <div className="space-y-2">
                  <Label>RFO deadline</Label>
                  <Input type="datetime-local" value={rfoDeadline} onChange={(e) => setRfoDeadline(e.target.value)} />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create demand"}</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

const clientSchema = z.object({
  name: z.string().trim().min(2).max(200),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  contact_name: z.string().trim().max(200).optional().or(z.literal("")),
  contact_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(50).optional().or(z.literal("")),
});

function NewClientForm({ createdBy, onCreated }: { createdBy: string; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = clientSchema.safeParse({ name, industry, contact_name: contactName, contact_email: contactEmail, contact_phone: contactPhone });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSaving(true);
    const { data, error } = await supabase.from("clients").insert({
      name: name.trim(),
      industry: industry.trim() || null,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      created_by: createdBy,
    }).select("id").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Client created");
    onCreated(data.id);
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></div>
      <div className="space-y-2"><Label>Industry</Label><Input value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={100} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Contact name</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={200} /></div>
        <div className="space-y-2"><Label>Contact phone</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={50} /></div>
      </div>
      <div className="space-y-2"><Label>Contact email</Label><Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={255} /></div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving…" : "Create client"}</Button>
    </form>
  );
}
