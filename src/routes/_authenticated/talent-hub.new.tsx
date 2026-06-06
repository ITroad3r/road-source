import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Upload, X, FileText, Sparkles } from "lucide-react";
import { parseCvFile } from "@/lib/api/cv-parser.functions";

export const Route = createFileRoute("/_authenticated/talent-hub/new")({
  ssr: false,
  head: () => ({ meta: [{ title: "Add candidate — RoadSource" }] }),
  component: NewCandidate,
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

const MAX_FILE = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

function NewCandidate() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [seniority, setSeniority] = useState<string>("mid");
  const [yearsExp, setYearsExp] = useState("");
  const [engagement, setEngagement] = useState<string>("");
  const [availability, setAvailability] = useState("available");
  const [dailyRate, setDailyRate] = useState("");
  const [salary, setSalary] = useState("");
  const [remoteOk, setRemoteOk] = useState(true);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

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

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return setFile(null);
    if (f.size > MAX_FILE) return toast.error("File too large (max 10 MB)");
    if (!ALLOWED.includes(f.type)) return toast.error("Only PDF, DOC or DOCX allowed");
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ full_name: fullName, email, phone, headline, summary, location, linkedin_url: linkedin });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    setSaving(true);
    try {
      let cv_url: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "pdf";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("cvs").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        cv_url = path; // store the storage path; signed URLs generated on read
      }

      const { data, error } = await supabase.from("talent_hub_cvs").insert({
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        headline: headline.trim() || null,
        summary: summary.trim() || null,
        location: location.trim() || null,
        linkedin_url: linkedin.trim() || null,
        seniority: seniority as "junior" | "mid" | "senior" | "lead" | "principal",
        years_experience: yearsExp ? Number(yearsExp) : null,
        engagement_preference: (engagement || null) as "freelance" | "permanent" | null,
        availability: availability as "available" | "available_soon" | "unavailable",
        daily_rate: dailyRate ? Number(dailyRate) : null,
        salary_expectation: salary ? Number(salary) : null,
        remote_ok: remoteOk,
        skills,
        tags,
        cv_url,
        created_by: user.id,
      }).select("id").single();
      if (error) throw error;

      toast.success("Candidate added to Talent Hub");
      navigate({ to: "/talent-hub" });
      void data;
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Add candidate</h1>
        <p className="text-muted-foreground mt-1">Create a new CV in the Talent Hub. Upload a PDF or DOCX if you have one.</p>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full name *"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} /></Field>
              <Field label="Headline"><Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={200} placeholder="Senior React Engineer" /></Field>
              <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} /></Field>
              <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} /></Field>
              <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} /></Field>
              <Field label="LinkedIn URL"><Input type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} maxLength={500} /></Field>
            </div>
            <Field label="Summary"><Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={5000} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Seniority">
                <Select value={seniority} onValueChange={setSeniority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["junior","mid","senior","lead","principal"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Years of experience"><Input type="number" min={0} max={60} value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} /></Field>
              <Field label="Availability">
                <Select value={availability} onValueChange={setAvailability}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="available_soon">Available soon</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Engagement preference">
                <Select value={engagement} onValueChange={setEngagement}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freelance">Freelance</SelectItem>
                    <SelectItem value="permanent">Permanent</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Daily rate (€)"><Input type="number" min={0} value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} /></Field>
              <Field label="Salary expectation (€)"><Input type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} /></Field>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={remoteOk} onCheckedChange={setRemoteOk} id="remote" />
              <Label htmlFor="remote">Open to remote work</Label>
            </div>

            <Field label="Skills">
              <TagInput value={skillInput} setValue={setSkillInput} onAdd={addSkill} items={skills} onRemove={(s) => setSkills(skills.filter((x) => x !== s))} placeholder="Type a skill and press Enter" />
            </Field>
            <Field label="Tags">
              <TagInput value={tagInput} setValue={setTagInput} onAdd={addTag} items={tags} onRemove={(t) => setTags(tags.filter((x) => x !== t))} placeholder="e.g. fintech, gov, ex-Google" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>CV file</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md p-6 cursor-pointer hover:bg-accent/40 transition">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{file ? "Change file" : "Click to upload PDF / DOC / DOCX (max 10 MB)"}</span>
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={onFileChange} />
            </label>
            {file && (
              <div className="flex items-center justify-between p-3 rounded-md bg-muted text-sm">
                <span className="flex items-center gap-2 min-w-0"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{file.name}</span><span className="text-muted-foreground shrink-0">({(file.size/1024/1024).toFixed(2)} MB)</span></span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)}><X className="h-4 w-4" /></Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/talent-hub" })}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add candidate"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-2"><Label>{label}</Label>{children}</div>);
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
