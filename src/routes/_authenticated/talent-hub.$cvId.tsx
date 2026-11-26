import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Save, X, Trash2, Upload, FileText, MapPin, Mail, Phone, ExternalLink, User, Briefcase, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { PreferredContractSelect, PreferredContractBadge, PreferredContractView } from "@/components/PreferredContractType";
import { ActivityLog } from "@/components/ActivityLog";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/talent-hub/$cvId")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Candidate \u2014 RoadSource" },
    { name: "description", content: "Review candidate profiles, CV documents and demand participation in RoadSource." },
    { property: "og:title", content: "Candidate \u2014 RoadSource" },
    { property: "og:description", content: "Review candidate profiles, CV documents and demand participation in RoadSource." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CandidateDetail,
});

const schema = z.object({
  full_name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  headline: z.string().trim().max(200).optional().or(z.literal("")),
  summary: z.string().trim().max(5000).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  linkedin_url: z.string().trim().url().max(500).optional().or(z.literal("")),
});

const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

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

function CandidateDetail() {
  const { t } = useTranslation();
  const { cvId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const { data: cv, isLoading } = useQuery({
    queryKey: ["talent-hub", cvId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talent_hub_cvs")
        .select("*")
        .eq("id", cvId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: appearances } = useQuery({
    queryKey: ["cv-appearances", cvId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_candidates")
        .select("id, stage, created_at, demand_id, demands(id, title, status, clients(name))")
        .eq("cv_id", cvId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: generatedCvs, refetch: refetchGenerated } = useQuery({
    queryKey: ["generated-cvs", cvId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_cvs")
        .select("id, format, storage_path, display_name, role_title, anonymized, created_at")
        .eq("cv_id", cvId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function openGenerated(path: string) {
    const { data, error } = await supabase.storage.from("cvs").createSignedUrl(path, 120);
    if (error || !data) return toast.error(error?.message ?? "Could not open file");
    window.open(data.signedUrl, "_blank");
  }
  async function deleteGenerated(id: string, path: string) {
    if (!confirm("Delete this generated CV?")) return;
    await supabase.storage.from("cvs").remove([path]);
    const { error } = await supabase.from("generated_cvs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    refetchGenerated();
  }

  // editable state
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", headline: "", summary: "",
    location: "", linkedin_url: "", seniority: "mid",
    years_experience: "", engagement_preference: "", availability: "available",
    daily_rate: "", salary_expectation: "", remote_ok: true, preferred_contract_type: "",
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!cv) return;
    setForm({
      full_name: cv.full_name ?? "",
      email: cv.email ?? "",
      phone: cv.phone ?? "",
      headline: cv.headline ?? "",
      summary: cv.summary ?? "",
      location: cv.location ?? "",
      linkedin_url: cv.linkedin_url ?? "",
      seniority: cv.seniority ?? "mid",
      years_experience: cv.years_experience?.toString() ?? "",
      engagement_preference: cv.engagement_preference ?? "",
      availability: cv.availability ?? "available",
      daily_rate: cv.daily_rate?.toString() ?? "",
      salary_expectation: cv.salary_expectation?.toString() ?? "",
      remote_ok: cv.remote_ok ?? true,
      preferred_contract_type: cv.preferred_contract_type ?? "",
    });
    setSkills(cv.skills ?? []);
    setTags(cv.tags ?? []);
  }, [cv]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        full_name: form.full_name, email: form.email, phone: form.phone,
        headline: form.headline, summary: form.summary, location: form.location,
        linkedin_url: form.linkedin_url,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      let cv_url = cv?.cv_url ?? null;
      if (file) {
        const { data: u } = await supabase.auth.getUser();
        const ext = file.name.split(".").pop() || "pdf";
        const path = `${u.user?.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("cvs").upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        cv_url = path;
      }

      const { error } = await supabase.from("talent_hub_cvs").update({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        headline: form.headline.trim() || null,
        summary: form.summary.trim() || null,
        location: form.location.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        seniority: form.seniority as "junior" | "mid" | "senior" | "lead" | "principal",
        years_experience: form.years_experience ? Number(form.years_experience) : null,
        engagement_preference: (form.engagement_preference || null) as "freelance" | "permanent" | null,
        availability: form.availability as "available" | "available_soon" | "unavailable",
        daily_rate: form.daily_rate ? Number(form.daily_rate) : null,
        salary_expectation: form.salary_expectation ? Number(form.salary_expectation) : null,
        remote_ok: form.remote_ok,
        preferred_contract_type: (form.preferred_contract_type || null) as "cdi" | "cdd" | "freelance" | null,
        skills,
        tags,
        cv_url,
      }).eq("id", cvId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["talent-hub", cvId] });
      qc.invalidateQueries({ queryKey: ["talent-hub"] });
      toast.success("Candidate updated");
      setEditing(false);
      setFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("talent_hub_cvs").delete().eq("id", cvId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["talent-hub"] });
      toast.success("Candidate deleted");
      navigate({ to: "/talent-hub" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openCv() {
    if (!cv?.cv_url) return;
    if (/^https?:\/\//i.test(cv.cv_url)) { window.open(cv.cv_url, "_blank"); return; }
    const { data, error } = await supabase.storage.from("cvs").createSignedUrl(cv.cv_url, 60);
    if (error || !data) return toast.error(error?.message ?? "Could not open CV");
    window.open(data.signedUrl, "_blank");
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return setFile(null);
    if (f.size > MAX_FILE) return toast.error("File too large (max 10 MB)");
    if (!ALLOWED.includes(f.type)) return toast.error("Only PDF, DOC or DOCX allowed");
    setFile(f);
  }

  function addSkill() {
    const s = skillInput.trim();
    if (!s || skills.includes(s) || s.length > 50) return;
    setSkills([...skills, s]); setSkillInput("");
  }
  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t) || t.length > 50) return;
    setTags([...tags, t]); setTagInput("");
  }

  if (isLoading) return <div className="p-4 md:p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!cv) return <div className="p-4 md:p-8">Candidate not found.</div>;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/talent-hub"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Talent Hub</Link>
        </Button>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete candidate?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently removes the CV from the Talent Hub. Pipeline entries referencing this candidate will also be removed.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setFile(null); }}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {editing ? (
                <>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="text-xl font-semibold h-10" maxLength={200} />
                  <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Headline" maxLength={200} />
                </>
              ) : (
                <>
                  <CardTitle className="text-2xl">{cv.full_name}</CardTitle>
                  <div className="text-sm text-muted-foreground">{cv.headline ?? "—"}</div>
                </>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {!editing && cv.availability && (
                  <Badge variant={cv.availability === "available" ? "default" : "secondary"} className="text-xs capitalize">
                    {cv.availability.replace("_", " ")}
                  </Badge>
                )}
                {!editing && cv.seniority && <Badge variant="outline" className="text-xs capitalize">{cv.seniority}</Badge>}
                {!editing && <PreferredContractBadge value={cv.preferred_contract_type} />}
                {!editing && cv.engagement_preference && <Badge variant="secondary" className="text-xs capitalize">{cv.engagement_preference}</Badge>}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Contact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Email">
              {editing
                ? <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
                : (cv.email ? <a href={`mailto:${cv.email}`} className="text-sm text-primary hover:underline flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{cv.email}</a> : <span className="text-sm text-muted-foreground">—</span>)}
            </Field>
            <Field label="Phone">
              {editing
                ? <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={50} />
                : (cv.phone ? <span className="text-sm flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{cv.phone}</span> : <span className="text-sm text-muted-foreground">—</span>)}
            </Field>
            <Field label="Location">
              {editing
                ? <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={200} />
                : (cv.location ? <span className="text-sm flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{cv.location}</span> : <span className="text-sm text-muted-foreground">—</span>)}
            </Field>
            <Field label="LinkedIn">
              {editing
                ? <Input type="url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} maxLength={500} />
                : (cv.linkedin_url ? <a href={cv.linkedin_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" />Open profile</a> : <span className="text-sm text-muted-foreground">—</span>)}
            </Field>
          </div>

          <Field label="Summary">
            {editing
              ? <Textarea rows={5} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={5000} />
              : <p className="text-sm whitespace-pre-wrap">{cv.summary ?? <span className="text-muted-foreground">No summary</span>}</p>}
          </Field>

          {/* Profile */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Seniority">
              {editing ? (
                <Select value={form.seniority} onValueChange={(v) => setForm({ ...form, seniority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["junior","mid","senior","lead","principal"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : <span className="text-sm capitalize">{cv.seniority ?? "—"}</span>}
            </Field>
            <Field label="Years of experience">
              {editing
                ? <Input type="number" min={0} max={60} value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: e.target.value })} />
                : <span className="text-sm">{cv.years_experience ?? "—"}</span>}
            </Field>
            <Field label="Availability">
              {editing ? (
                <Select value={form.availability} onValueChange={(v) => setForm({ ...form, availability: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="available_soon">Available soon</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              ) : <span className="text-sm capitalize">{cv.availability?.replace("_", " ") ?? "—"}</span>}
            </Field>
            <div className="sm:col-span-2">
              {editing
                ? <PreferredContractSelect id="pref-contract" value={form.preferred_contract_type} onChange={(v) => setForm({ ...form, preferred_contract_type: v })} />
                : <PreferredContractView value={cv.preferred_contract_type} />}
            </div>
            <Field label="Engagement preference (legacy)">
              {editing ? (
                <Select value={form.engagement_preference} onValueChange={(v) => setForm({ ...form, engagement_preference: v })}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freelance">Freelance</SelectItem>
                    <SelectItem value="permanent">Permanent</SelectItem>
                  </SelectContent>
                </Select>
              ) : <span className="text-sm capitalize">{cv.engagement_preference ?? "—"}</span>}
            </Field>
            <Field label="Daily rate (€)">
              {editing
                ? <Input type="number" min={0} value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} />
                : <span className="text-sm">{cv.daily_rate != null ? `€${cv.daily_rate}` : "—"}</span>}
            </Field>
            <Field label="Salary expectation (€)">
              {editing
                ? <Input type="number" min={0} value={form.salary_expectation} onChange={(e) => setForm({ ...form, salary_expectation: e.target.value })} />
                : <span className="text-sm">{cv.salary_expectation != null ? `€${cv.salary_expectation}` : "—"}</span>}
            </Field>
          </div>

          {editing && (
            <div className="flex items-center gap-3">
              <Switch checked={form.remote_ok} onCheckedChange={(v) => setForm({ ...form, remote_ok: v })} id="remote" />
              <Label htmlFor="remote">Open to remote work</Label>
            </div>
          )}
          {!editing && (
            <div className="text-sm text-muted-foreground">Remote: {cv.remote_ok ? "Yes" : "No"}</div>
          )}

          <Field label="Skills">
            {editing ? (
              <TagInput value={skillInput} setValue={setSkillInput} onAdd={addSkill} items={skills} onRemove={(s) => setSkills(skills.filter((x) => x !== s))} placeholder="Type a skill and press Enter" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(cv.skills ?? []).length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                {(cv.skills ?? []).map((s: string) => <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>)}
              </div>
            )}
          </Field>

          <Field label="Tags">
            {editing ? (
              <TagInput value={tagInput} setValue={setTagInput} onAdd={addTag} items={tags} onRemove={(t) => setTags(tags.filter((x) => x !== t))} placeholder="e.g. fintech, ex-Google" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(cv.tags ?? []).length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                {(cv.tags ?? []).map((t: string) => <Badge key={t} variant="outline" className="text-xs font-normal">{t}</Badge>)}
              </div>
            )}
          </Field>

          <Field label="CV file">
            <div className="space-y-2">
              {cv.cv_url && !editing && (
                <button type="button" onClick={openCv} className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <FileText className="h-3.5 w-3.5" /> Open current CV
                </button>
              )}
              {editing && (
                <>
                  {cv.cv_url && !file && (
                    <button type="button" onClick={openCv} className="flex items-center gap-1 text-sm text-primary hover:underline">
                      <FileText className="h-3.5 w-3.5" /> Current CV
                    </button>
                  )}
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md p-4 cursor-pointer hover:bg-accent/40 transition">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{file ? `Selected: ${file.name}` : "Click to upload a new CV (PDF / DOC / DOCX, max 10 MB)"}</span>
                    <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={onFileChange} />
                  </label>
                  {file && <Button type="button" size="sm" variant="ghost" onClick={() => setFile(null)}><X className="h-3.5 w-3.5 mr-1" />Remove selection</Button>}
                </>
              )}
              {!cv.cv_url && !editing && <span className="text-sm text-muted-foreground">No CV uploaded</span>}
            </div>
          </Field>

          {!editing && (
            <Field label="Branded export">
              <Button asChild variant="outline" size="sm" className="w-fit">
                <Link to="/talent-hub/generate/$cvId" params={{ cvId }}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate ITROAD CV
                </Link>
              </Button>
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Generated ITROAD CVs ({generatedCvs?.length ?? 0})</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link to="/talent-hub/generate/$cvId" params={{ cvId }}><Sparkles className="h-3.5 w-3.5 mr-1.5" /> New</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {(!generatedCvs || generatedCvs.length === 0) ? (
            <div className="text-sm text-muted-foreground">No branded CVs generated yet.</div>
          ) : (
            <div className="space-y-2">
              {generatedCvs.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{g.display_name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{g.format}</Badge>
                      {g.anonymized && <Badge variant="secondary" className="text-[10px]">anonymized</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {g.role_title ? `${g.role_title} · ` : ""}{format(new Date(g.created_at), "PP · p")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openGenerated(g.storage_path)}>Open</Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteGenerated(g.id, g.storage_path)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Briefcase className="h-4 w-4" /> Pipeline appearances ({appearances?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {(!appearances || appearances.length === 0) && (
            <div className="text-sm text-muted-foreground">Not in any demand pipelines yet.</div>
          )}
          <div className="space-y-2">
            {appearances?.map((a) => (
              <Link
                key={a.id}
                to="/demands/$demandId"
                params={{ demandId: a.demand_id }}
                className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-accent transition"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.demands?.title ?? "Untitled demand"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {a.demands?.clients?.name ?? "—"} · added {format(new Date(a.created_at), "MMM d, yyyy")}
                  </div>
                </div>
                <Badge variant="outline" className={stageColors[a.stage] ?? ""}>{t(`dash.stage.${a.stage}`)}</Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <ActivityLog scope={{ cvId }} currentUserId={user.id} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>);
}

function TagInput({ value, setValue, onAdd, items, onRemove, placeholder }: {
  value: string; setValue: (v: string) => void; onAdd: () => void;
  items: string[]; onRemove: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={50}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} />
        <Button type="button" variant="outline" onClick={onAdd}>Add</Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1">
              {s}
              <button type="button" onClick={() => onRemove(s)}><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
