import { createFileRoute, Link } from "@tanstack/react-router";
import { useTx } from "@/hooks/use-tx";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Upload, Sparkles, Download, Loader2, FileText, Plus, Trash2, Save } from "lucide-react";
import { saveAs } from "file-saver";
import { pdf } from "@react-pdf/renderer";
import itroadLogo from "@/assets/itroad-logo.jpg.asset.json";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import { parseFullCv } from "@/lib/api/cv-deep-parser.functions";
import { ItroadCvPdf } from "@/components/cv-template/ItroadCvPdf";
import { buildItroadDocx } from "@/components/cv-template/buildDocx";
import type { CvData, CvExperience, CvEducation } from "@/components/cv-template/types";

export const Route = createFileRoute("/_authenticated/talent-hub/generate/$cvId")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Generate ITROAD CV \u2014 RoadSource" },
    { name: "description", content: "Prepare branded ITROAD candidate CV documents from RoadSource profiles." },
    { property: "og:title", content: "Generate ITROAD CV \u2014 RoadSource" },
    { property: "og:description", content: "Prepare branded ITROAD candidate CV documents from RoadSource profiles." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: GenerateCvPage,
});

const ALLOWED = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX = 10 * 1024 * 1024;

const emptyExp = (): CvExperience => ({ title: "", company: "", location: "", period: "", project: "", bullets: [""] });
const emptyEdu = (): CvEducation => ({ title: "", school: "", location: "", period: "", notes: [] });

function GenerateCvPage() {
  const { tx } = useTx();
  const { cvId } = Route.useParams();
  const parseFn = useServerFn(parseFullCv);

  const { data: candidate } = useQuery({
    queryKey: ["talent-hub", cvId, "for-generate"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talent_hub_cvs")
        .select("id, full_name, email, phone, headline, location, linkedin_url, cv_url, skills")
        .eq("id", cvId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [cv, setCv] = useState<CvData | null>(null);
  const [anonymize, setAnonymize] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  async function parseFromStored() {
    if (!candidate?.cv_url) return toast.error(tx("This candidate has no CV file. Upload one first or upload a file below.", "Ce candidat n'a pas de fichier CV. Importez-en un ci-dessous."));
    if (/^https?:\/\//i.test(candidate.cv_url)) return toast.error(tx("Stored CV is an external link. Upload a file below.", "Le CV enregistré est un lien externe. Importez un fichier ci-dessous."));
    setParsing(true);
    try {
      const { cv } = await parseFn({ data: { storage_path: candidate.cv_url } });
      seedFromParsed(cv);
      toast.success(tx("CV parsed — review and edit before generating", "CV analysé — relisez et modifiez avant de générer"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setParsing(false); }
  }

  async function parseFromUpload() {
    if (!uploadFile) return;
    if (!ALLOWED.includes(uploadFile.type)) return toast.error(tx("PDF / DOC / DOCX only", "PDF / DOC / DOCX uniquement"));
    if (uploadFile.size > MAX) return toast.error(tx("Max 10 MB", "10 Mo maximum"));
    setParsing(true);
    try {
      const path = `tmp/${cvId}/${Date.now()}-${uploadFile.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("cvs").upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });
      if (upErr) throw upErr;
      const { cv } = await parseFn({ data: { storage_path: path } });
      seedFromParsed(cv);
      toast.success(tx("CV parsed — review and edit before generating", "CV analysé — relisez et modifiez avant de générer"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setParsing(false); }
  }

  function seedFromParsed(p: CvData) {
    setCv({
      full_name: p.full_name || candidate?.full_name || "",
      role_title: p.role_title || candidate?.headline || "",
      email: p.email ?? candidate?.email ?? "",
      phone: p.phone ?? candidate?.phone ?? "",
      location: p.location ?? candidate?.location ?? "",
      linkedin_url: p.linkedin_url ?? candidate?.linkedin_url ?? "",
      skill_groups: p.skill_groups?.length ? p.skill_groups : (candidate?.skills ?? []).length ? [(candidate!.skills as string[]).join(" | ")] : [""],
      experiences: p.experiences?.length ? p.experiences : [emptyExp()],
      educations: p.educations?.length ? p.educations : [emptyEdu()],
      others: p.others ?? [],
    });
  }

  function blank() {
    setCv({
      full_name: candidate?.full_name ?? "",
      role_title: candidate?.headline ?? "",
      email: candidate?.email ?? "",
      phone: candidate?.phone ?? "",
      location: candidate?.location ?? "",
      linkedin_url: candidate?.linkedin_url ?? "",
      skill_groups: [(candidate?.skills as string[] | undefined ?? []).join(" | ")].filter(Boolean),
      experiences: [emptyExp()],
      educations: [emptyEdu()],
      others: [],
    });
  }

  const ready = !!cv;

  async function fetchLogoBytes(): Promise<Uint8Array | null> {
    try {
      const res = await fetch(itroadLogo.url);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch { return null; }
  }

  async function buildPdfBlob() {
    if (!cv) throw new Error(tx("No CV", "Aucun CV"));
    return await pdf(<ItroadCvPdf cv={cv} anonymize={anonymize} />).toBlob();
  }
  async function buildDocxBlob() {
    if (!cv) throw new Error(tx("No CV", "Aucun CV"));
    const bytes = await fetchLogoBytes();
    return await buildItroadDocx(cv, anonymize, bytes);
  }

  async function downloadPdf() {
    if (!cv) return;
    try { saveAs(await buildPdfBlob(), fileBase(cv) + ".pdf"); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function downloadDocx() {
    if (!cv) return;
    try { saveAs(await buildDocxBlob(), fileBase(cv) + ".docx"); }
    catch (e) { toast.error((e as Error).message); }
  }

  const [saving, setSaving] = useState(false);
  async function saveToProfile() {
    if (!cv) return;
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;
      const ts = Date.now();
      const base = fileBase(cv);
      const pdfBlob = await buildPdfBlob();
      const docxBlob = await buildDocxBlob();
      const pdfPath = `generated/${cvId}/${ts}-${base}.pdf`;
      const docxPath = `generated/${cvId}/${ts}-${base}.docx`;

      const up1 = await supabase.storage.from("cvs").upload(pdfPath, pdfBlob, { contentType: "application/pdf", upsert: false });
      if (up1.error) throw up1.error;
      const up2 = await supabase.storage.from("cvs").upload(docxPath, docxBlob, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: false });
      if (up2.error) throw up2.error;

      const rows = [
        { cv_id: cvId, format: "pdf" as const, storage_path: pdfPath, display_name: cv.full_name, role_title: cv.role_title, anonymized: anonymize, generated_by: userId },
        { cv_id: cvId, format: "docx" as const, storage_path: docxPath, display_name: cv.full_name, role_title: cv.role_title, anonymized: anonymize, generated_by: userId },
      ];
      const ins = await supabase.from("generated_cvs").insert(rows);
      if (ins.error) throw ins.error;
      toast.success(tx("Saved to candidate profile", "Enregistré dans le profil du candidat"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/talent-hub/$cvId" params={{ cvId }}><ArrowLeft className="h-4 w-4 mr-1" /> {tx("Back to candidate", "Retour au candidat")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> {tx("Generate ITROAD-branded CV", "Générer un CV aux couleurs ITROAD")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {tx("Upload any CV (or use this candidate's stored CV). AI extracts the data, you review & edit, then export as PDF or DOCX in the ITROAD template.", "Importez un CV (ou utilisez celui enregistré pour ce candidat). L'IA extrait les données, vous relisez et modifiez, puis exportez en PDF ou DOCX au modèle ITROAD.")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button onClick={parseFromStored} disabled={parsing || !candidate?.cv_url} variant="outline">
              {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Use stored CV
            </Button>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md px-3 py-2 cursor-pointer hover:bg-accent/40 transition text-sm">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{uploadFile ? uploadFile.name : tx("Upload any CV (PDF/DOC/DOCX)", "Importer un CV (PDF/DOC/DOCX)")}</span>
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
            </label>
            <Button onClick={parseFromUpload} disabled={parsing || !uploadFile}>
              {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Parse uploaded file
            </Button>
          </div>
          <button onClick={blank} className="text-xs text-muted-foreground hover:underline">{tx("or start from a blank form", "ou partir d'un formulaire vierge")}</button>
        </CardContent>
      </Card>

      {ready && cv && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{tx("Header", "En-tête")}</CardTitle>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={anonymize} onCheckedChange={setAnonymize} />
                {tx("Anonymize (hide contact, abbreviate surname)", "Anonymiser (masquer les coordonnées, abréger le nom)")}
              </label>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label={tx("Full name", "Nom complet")}><Input value={cv.full_name} onChange={(e) => setCv({ ...cv, full_name: e.target.value })} /></Field>
              <Field label={tx("Role / headline", "Poste / titre")}><Input value={cv.role_title} onChange={(e) => setCv({ ...cv, role_title: e.target.value })} placeholder={tx("e.g. DEVELOPPEUR JAVA", "ex. DÉVELOPPEUR JAVA")} /></Field>
              <Field label={tx("Email", "E-mail")}><Input value={cv.email ?? ""} onChange={(e) => setCv({ ...cv, email: e.target.value })} /></Field>
              <Field label={tx("Phone", "Téléphone")}><Input value={cv.phone ?? ""} onChange={(e) => setCv({ ...cv, phone: e.target.value })} /></Field>
              <Field label={tx("Location", "Localisation")}><Input value={cv.location ?? ""} onChange={(e) => setCv({ ...cv, location: e.target.value })} /></Field>
              <Field label="LinkedIn"><Input value={cv.linkedin_url ?? ""} onChange={(e) => setCv({ ...cv, linkedin_url: e.target.value })} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{tx("Skills", "Compétences")}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setCv({ ...cv, skill_groups: [...cv.skill_groups, ""] })}><Plus className="h-3 w-3 mr-1" />{tx("Add line", "Ajouter une ligne")}</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {cv.skill_groups.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={s} onChange={(e) => updateAt(cv.skill_groups, i, e.target.value, (arr) => setCv({ ...cv, skill_groups: arr }))} placeholder="Java | Spring boot | Hibernate" />
                  <Button size="icon" variant="ghost" onClick={() => setCv({ ...cv, skill_groups: cv.skill_groups.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{tx("Experience", "Expérience")}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setCv({ ...cv, experiences: [...cv.experiences, emptyExp()] })}><Plus className="h-3 w-3 mr-1" />{tx("Add", "Ajouter")}</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {cv.experiences.map((e, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input value={e.title} placeholder={tx("Role title", "Intitulé du poste")} onChange={(ev) => updateExp(cv, i, { ...e, title: ev.target.value }, setCv)} />
                    <Input value={e.company} placeholder={tx("Company", "Entreprise")} onChange={(ev) => updateExp(cv, i, { ...e, company: ev.target.value }, setCv)} />
                    <Input value={e.location} placeholder={tx("Location", "Localisation")} onChange={(ev) => updateExp(cv, i, { ...e, location: ev.target.value }, setCv)} />
                    <Input value={e.period} placeholder="MM/YYYY-MM/YYYY" onChange={(ev) => updateExp(cv, i, { ...e, period: ev.target.value }, setCv)} />
                  </div>
                  <Input value={e.project ?? ""} placeholder={tx("Project description (optional)", "Description du projet (facultatif)")} onChange={(ev) => updateExp(cv, i, { ...e, project: ev.target.value }, setCv)} />
                  <Textarea rows={4} value={e.bullets.join("\n")} placeholder={tx("One bullet per line", "Un point par ligne")}
                    onChange={(ev) => updateExp(cv, i, { ...e, bullets: ev.target.value.split("\n") }, setCv)} />
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setCv({ ...cv, experiences: cv.experiences.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 mr-1" />{tx("Remove", "Retirer")}</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{tx("Education", "Formation")}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setCv({ ...cv, educations: [...cv.educations, emptyEdu()] })}><Plus className="h-3 w-3 mr-1" />{tx("Add", "Ajouter")}</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {cv.educations.map((e, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input value={e.title} placeholder={tx("Degree", "Diplôme")} onChange={(ev) => updateEdu(cv, i, { ...e, title: ev.target.value }, setCv)} />
                    <Input value={e.school} placeholder={tx("Institution", "Établissement")} onChange={(ev) => updateEdu(cv, i, { ...e, school: ev.target.value }, setCv)} />
                    <Input value={e.location} placeholder={tx("Location", "Localisation")} onChange={(ev) => updateEdu(cv, i, { ...e, location: ev.target.value }, setCv)} />
                    <Input value={e.period} placeholder={tx("Period", "Période")} onChange={(ev) => updateEdu(cv, i, { ...e, period: ev.target.value }, setCv)} />
                  </div>
                  <Textarea rows={2} value={e.notes.join("\n")} placeholder={tx("One note per line", "Une note par ligne")}
                    onChange={(ev) => updateEdu(cv, i, { ...e, notes: ev.target.value.split("\n") }, setCv)} />
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setCv({ ...cv, educations: cv.educations.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 mr-1" />{tx("Remove", "Retirer")}</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{tx("Others (certifications, side projects)", "Autres (certifications, projets personnels)")}</CardTitle></CardHeader>
            <CardContent>
              <Textarea rows={4} value={cv.others.join("\n")} placeholder={tx("One item per line", "Un élément par ligne")}
                onChange={(e) => setCv({ ...cv, others: e.target.value.split("\n") })} />
            </CardContent>
          </Card>

          <Card className="sticky bottom-4 shadow-lg">
            <CardContent className="p-4 flex flex-wrap gap-3 justify-end items-center">
              <span className="text-sm text-muted-foreground mr-auto">{tx("Ready to export", "Prêt à exporter")}</span>
              <Button variant="outline" onClick={downloadDocx}><Download className="h-4 w-4 mr-2" />{tx("Download DOCX", "Télécharger DOCX")}</Button>
              <Button variant="outline" onClick={downloadPdf}><Download className="h-4 w-4 mr-2" />{tx("Download PDF", "Télécharger PDF")}</Button>
              <Button onClick={saveToProfile} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save to profile
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function updateAt<T>(arr: T[], i: number, v: T, set: (a: T[]) => void) {
  const next = arr.slice(); next[i] = v; set(next);
}
function updateExp(cv: CvData, i: number, v: CvExperience, set: (c: CvData) => void) {
  const next = cv.experiences.slice(); next[i] = v; set({ ...cv, experiences: next });
}
function updateEdu(cv: CvData, i: number, v: CvEducation, set: (c: CvData) => void) {
  const next = cv.educations.slice(); next[i] = v; set({ ...cv, educations: next });
}

function fileBase(cv: CvData) {
  const name = (cv.full_name || "candidate").trim().replace(/\s+/g, "_");
  return `ITROAD_${name}_CV`;
}
