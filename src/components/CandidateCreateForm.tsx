import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMyRoles } from "@/hooks/useMyRoles";
import { can } from "@/lib/permissions";
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
import { PreferredContractSelect } from "@/components/PreferredContractType";
import { parseCvFile } from "@/lib/api/cv-parser.functions";

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

export function CandidateCreateForm({ userId, demandId, onSaved, onCancel }: { userId: string; demandId?: string; onSaved: () => void; onCancel: () => void }) {

  const { t } = useTranslation();
  const { data: roles } = useMyRoles(userId);
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
  const [preferredContract, setPreferredContract] = useState<string>("");
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
  const [parsing, setParsing] = useState(false);
  const parseCv = useServerFn(parseCvFile);

  async function autofillFromCv() {
    if (!can(roles, "candidates.edit")) return;
    if (!file) return toast.error(t("candidateCreate.chooseFile", "Choose a CV file first"));
    setParsing(true);
    let tempPath: string | null = null;
    try {
      const ext = file.name.split(".").pop() || "pdf";
      tempPath = `${userId}/parse-tmp/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("cvs")
        .upload(tempPath, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { candidate, warning } = await parseCv({ data: { storage_path: tempPath } });
      if (warning) toast.warning(warning);
      if (candidate.full_name && !fullName) setFullName(candidate.full_name);
      if (candidate.email && !email) setEmail(candidate.email);
      if (candidate.phone && !phone) setPhone(candidate.phone);
      if (candidate.headline && !headline) setHeadline(candidate.headline);
      if (candidate.summary && !summary) setSummary(candidate.summary);
      if (candidate.location && !location) setLocation(candidate.location);
      if (candidate.linkedin_url && !linkedin) setLinkedin(candidate.linkedin_url);
      if (candidate.seniority) setSeniority(candidate.seniority);
      if (candidate.years_experience != null && !yearsExp)
        setYearsExp(String(candidate.years_experience));
      if (candidate.skills?.length) {
        const merged = Array.from(new Set([...skills, ...candidate.skills]));
        setSkills(merged.slice(0, 40));
      }
      if (candidate.tags?.length) {
        const merged = Array.from(new Set([...tags, ...candidate.tags]));
        setTags(merged.slice(0, 20));
      }
      toast.success(t("candidateCreate.parsed", "CV parsed — review the pre-filled fields"));
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to parse CV");
    } finally {
      if (tempPath) {
        await supabase.storage.from("cvs").remove([tempPath]).catch(() => {});
      }
      setParsing(false);
    }
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

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return setFile(null);
    if (f.size > MAX_FILE) return toast.error(t("candidateCreate.fileTooLarge", "File too large (max 10 MB)"));
    if (!ALLOWED.includes(f.type)) return toast.error(t("candidateCreate.fileType", "Only PDF, DOC or DOCX allowed"));
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !can(roles, "candidates.edit")) return;
    const parsed = schema.safeParse({ full_name: fullName, email, phone, headline, summary, location, linkedin_url: linkedin });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Invalid candidate details");

    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      let cv_url: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "pdf";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("cvs").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        uploadedPath = path;
        cv_url = path; // store the storage path; signed URLs generated on read
      }

      const candidate = {
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
        preferred_contract_type: (preferredContract || null) as "cdi" | "cdd" | "freelance" | null,
        skills,
        tags,
        cv_url,
        created_by: userId,
      } satisfies import("@/integrations/supabase/types").Database["public"]["Tables"]["talent_hub_cvs"]["Insert"];
      const { error } = demandId
        ? await supabase.rpc("create_candidate_for_demand", { _candidate: candidate, _demand_id: demandId })
        : await supabase.from("talent_hub_cvs").insert(candidate);
      if (error) throw error;

      toast.success(t("candidateCreate.saved", "Candidate added to Talent Hub"));
      onSaved();
    } catch (err) {
      if (uploadedPath) await supabase.storage.from("cvs").remove([uploadedPath]);
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("candidateCreate.addCandidate", "Add candidate")}</h1>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <Card>
          <CardHeader><CardTitle>{t("candidateCreate.identity", "Identity")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={t("candidateCreate.fullName", "Full name *")}><Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} /></Field>
              <Field label={t("candidateCreate.headline", "Headline")}><Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={200} placeholder="Senior React Engineer" /></Field>
              <Field label={t("candidateCreate.email", "Email")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} /></Field>
              <Field label={t("candidateCreate.phone", "Phone")}><Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} /></Field>
              <Field label={t("candidateCreate.location", "Location")}><Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} /></Field>
              <Field label={t("candidateCreate.linkedin", "LinkedIn URL")}><Input type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} maxLength={500} /></Field>
            </div>
            <Field label={t("candidateCreate.summary", "Summary")}><Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={5000} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("candidateCreate.profile", "Profile")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label={t("candidateCreate.seniority", "Seniority")}>
                <Select value={seniority} onValueChange={setSeniority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["junior","mid","senior","lead","principal"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("candidateCreate.yearsExperience", "Years of experience")}><Input type="number" min={0} max={60} value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} /></Field>
              <Field label={t("candidateCreate.availability", "Availability")}>
                <Select value={availability} onValueChange={setAvailability}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">{t("candidateCreate.available", "Available")}</SelectItem>
                    <SelectItem value="available_soon">{t("candidateCreate.availableSoon", "Available soon")}</SelectItem>
                    <SelectItem value="unavailable">{t("candidateCreate.unavailable", "Unavailable")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2"><PreferredContractSelect id="new-pref-contract" value={preferredContract} onChange={setPreferredContract} /></div>
              <Field label={t("candidateCreate.engagement", "Engagement preference (legacy)")}>
                <Select value={engagement} onValueChange={setEngagement}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freelance">{t("candidateCreate.freelance", "Freelance")}</SelectItem>
                    <SelectItem value="permanent">{t("candidateCreate.permanent", "Permanent")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("candidateCreate.dailyRate", "Daily rate (€)")}><Input type="number" min={0} value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} /></Field>
              <Field label={t("candidateCreate.salary", "Salary expectation (€)")}><Input type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} /></Field>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={remoteOk} onCheckedChange={setRemoteOk} id="remote" />
              <Label htmlFor="remote">{t("candidateCreate.remote", "Open to remote work")}</Label>
            </div>

            <Field label={t("candidateCreate.skills", "Skills")}>
              <TagInput value={skillInput} setValue={setSkillInput} onAdd={addSkill} items={skills} onRemove={(s) => setSkills(skills.filter((x) => x !== s))} placeholder="Type a skill and press Enter" />
            </Field>
            <Field label={t("candidateCreate.tags", "Tags")}>
              <TagInput value={tagInput} setValue={setTagInput} onAdd={addTag} items={tags} onRemove={(t) => setTags(tags.filter((x) => x !== t))} placeholder="e.g. fintech, gov, ex-Google" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("candidateCreate.cvFile", "CV file")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md p-6 cursor-pointer hover:bg-accent/40 transition">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{file ? t("candidateCreate.changeFile", "Change file") : t("candidateCreate.uploadFile", "Click to upload PDF / DOC / DOCX (max 10 MB)")}</span>
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={onFileChange} />
            </label>
            {file && (
              <div className="flex items-center justify-between p-3 rounded-md bg-muted text-sm">
                <span className="flex items-center gap-2 min-w-0"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{file.name}</span><span className="text-muted-foreground shrink-0">({(file.size/1024/1024).toFixed(2)} MB)</span></span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)}><X className="h-4 w-4" /></Button>
              </div>
            )}
            {file && (
              <Button type="button" variant="secondary" onClick={autofillFromCv} disabled={parsing} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                {parsing ? t("candidateCreate.parsing", "Parsing CV with AI…") : t("candidateCreate.autofill", "Auto-fill form from CV (AI)")}
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>{t("candidateCreate.cancel", "Cancel")}</Button>
          <Button type="submit" disabled={saving}>{saving ? t("candidateCreate.saving", "Saving…") : t("candidateCreate.addCandidate", "Add candidate")}</Button>
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
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={50}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} />
        <Button type="button" variant="outline" onClick={onAdd}>{t("candidateCreate.add", "Add")}</Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1">
              {s}
              <Button type="button" variant="ghost" size="icon" className="h-4 w-4" aria-label={`Remove ${s}`} onClick={() => onRemove(s)}><X className="h-3 w-3" /></Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
