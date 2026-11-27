import { useEffect, useRef, useState } from "react";
import { txNow } from "@/hooks/use-tx";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { FileText, Upload, Sparkles, Loader2, Download, Eye, Pencil, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { alignCv } from "@/lib/align-cv.functions";
import { validateAlignmentFile, type AlignedCv, type AlignmentResult } from "@/lib/align-cv";
import { toast } from "sonner";

async function fileData(file: File) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1] ?? "") : reject(new Error(txNow("Invalid file", "Fichier invalide")));
    reader.onerror = () => reject(new Error(txNow("Cannot read file", "Impossible de lire le fichier"))); reader.readAsDataURL(file);
  });
  return { name: file.name, base64 };
}

export function AlignCvWorkspace() {
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const tx = (en: string, french: string) => fr ? french : en;
  const callAlign = useServerFn(alignCv);
  const [candidate, setCandidate] = useState<File | null>(null);
  const [specification, setSpecification] = useState<File | null>(null);
  const [language, setLanguage] = useState<"fr" | "en">(fr ? "fr" : "en");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [cv, setCv] = useState<AlignedCv | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [branded, setBranded] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [tab, setTab] = useState("review");
  const [previewUrl, setPreviewUrl] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  function update(next: AlignedCv) { setCv(next); setConfirmed(false); setPreviewUrl(""); }
  function choose(file: File | null, setter: (f: File | null) => void) {
    if (file && !validateAlignmentFile(file)) { toast.error(tx("Choose a PDF up to 10 MB.", "Choisissez un PDF de 10 Mo maximum.")); return; }
    setter(file); setError("");
  }
  async function align() {
    if (!candidate || !specification || busy) return;
    setBusy(true); setError("");
    const current = ++version.current;
    try {
      const [source, job] = await Promise.all([fileData(candidate), fileData(specification)]);
      const response = await callAlign({ data: { candidate: source, specification: job, language, target_role: target } });
      if (current !== version.current) return;
      if (!response.ok) {
        const messages = {
          credits: tx("AI credits are exhausted. Add credits before generating again.", "Les crédits IA sont épuisés. Ajoutez des crédits avant une nouvelle génération."),
          rate: tx("AI is busy. Please wait before another request.", "L’IA est très sollicitée. Patientez avant une nouvelle demande."),
          access: tx("Workspace AI access is restricted. An owner must restore access.", "L’accès IA de l’espace est restreint. Le propriétaire doit le rétablir."),
          unknown: tx("Generation may have started, but no result was received. Check AI usage before trying again.", "La génération a peut-être démarré, sans résultat reçu. Vérifiez l’usage IA avant de réessayer."),
          refused: tx("AI could not process these documents. Your files have been preserved.", "L’IA n’a pas pu traiter ces documents. Vos fichiers sont conservés."),
          incomplete: tx("The result was incomplete. Your files have been preserved.", "Le résultat est incomplet. Vos fichiers sont conservés."),
          invalid: tx("AI returned an invalid result. Your files have been preserved.", "L’IA a renvoyé un résultat invalide. Vos fichiers sont conservés."),
          failed: tx("Alignment failed. Your files and previous result have been preserved.", "L’alignement a échoué. Vos fichiers et le résultat précédent sont conservés."),
        };
        setError(messages[response.error]); return;
      }
      setResult(response.result); setCv(response.result.cv); setConfirmed(false); setPreviewUrl(""); setTab("review");
    } catch { setError(tx("Alignment failed. Your documents have been preserved.", "L’alignement a échoué. Vos documents sont conservés.")); }
    finally { if (current === version.current) setBusy(false); }
  }
  async function exportPdf(download: boolean) {
    if (!cv || exporting || (download && !confirmed)) return;
    setExporting(true);
    try {
      const [{ pdf }, { AlignedCvPdf, readCvPalette }, { createElement }] = await Promise.all([import("@react-pdf/renderer"), import("@/components/cv-template/AlignedCvPdf"), import("react")]);
      const blob = await pdf(createElement(AlignedCvPdf, { cv, palette: readCvPalette(), language, anonymous, branded })).toBlob();
      if (download) {
        const { saveAs } = await import("file-saver");
        const filename = (anonymous ? "Candidate" : cv.full_name).replace(/[^\p{L}\p{N}_-]+/gu, "_");
        saveAs(blob, `${branded ? "ITROAD_" : ""}${filename}_Aligned_CV.pdf`);
      } else { setPreviewUrl(URL.createObjectURL(blob)); setTab("preview"); }
    } catch { toast.error(tx("PDF generation failed.", "La génération du PDF a échoué.")); }
    finally { setExporting(false); }
  }
  const changeSettings = () => { setConfirmed(false); setPreviewUrl(""); };
  return <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <div className="flex items-start gap-3"><div className="rounded-md bg-primary/10 p-3"><Sparkles className="h-6 w-6 text-primary" /></div><div><h1 className="text-2xl font-bold">Align CV</h1><p className="mt-1 text-sm text-muted-foreground">ITROAD GROUP · {tx("Candidate profile & client requirements", "Profil candidat & exigences client")}</p></div></div>
    <section className="space-y-4 border-y py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <UploadDocument title={tx("Candidate CV", "CV candidat")} file={candidate} disabled={busy} onChange={(file) => choose(file, setCandidate)} fr={fr} />
        <UploadDocument title={tx("Job specification", "Fiche de poste")} file={specification} disabled={busy} onChange={(file) => choose(file, setSpecification)} fr={fr} />
      </div>
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_160px_auto]">
        <Field label={tx("Target position (optional)", "Poste ciblé (facultatif)")}><Input value={target} maxLength={200} disabled={busy} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label={tx("CV language", "Langue du CV")}><Select value={language} disabled={busy || !!result} onValueChange={(value) => { if (value === "fr" || value === "en") setLanguage(value); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fr">Français</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></Field>
        <Button disabled={busy || !candidate || !specification} onClick={align}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{busy ? tx("Aligning…", "Alignement…") : tx("Align CV", "Aligner le CV")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{tx("Documents are processed by Lovable AI. They are not automatically saved to the CV Hub.", "Documents traités par Lovable AI. Ils ne sont pas enregistrés automatiquement dans le CV Hub.")}</p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
    {result && cv ? <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{result.job_title}</h2><p className="text-sm text-muted-foreground">{cv.full_name}</p></div><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setCv(null); setResult(null); setPreviewUrl(""); setConfirmed(false); setError(""); }}><RotateCcw className="mr-2 h-4 w-4" />{tx("New alignment", "Nouvel alignement")}</Button></div>
        {result.requires_anonymous || result.requires_no_branding ? <div className="flex gap-3 border-l-4 border-chart-4 bg-muted p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-foreground" /><p className="text-sm">{tx("The client requires", "Le client exige")}{result.requires_anonymous ? tx(" an anonymous CV", " un CV anonyme") : ""}{result.requires_anonymous && result.requires_no_branding ? tx(" and", " et") : ""}{result.requires_no_branding ? tx(" no agency logo", " aucun logo de cabinet") : ""}. {tx("Check export options before client submission.", "Vérifiez les options d’export avant l’envoi au client.")}</p></div> : null}
        <div className="flex flex-wrap gap-x-8 gap-y-3"><label className="flex items-center gap-2 text-sm"><Switch checked={branded} onCheckedChange={(value) => { setBranded(value); changeSettings(); }} />{tx("ITROAD branding", "Logo ITROAD")}</label><label className="flex items-center gap-2 text-sm"><Switch checked={anonymous} onCheckedChange={(value) => { setAnonymous(value); changeSettings(); }} />{tx("Anonymous profile", "Profil anonyme")}</label></div>
      </section>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex"><TabsTrigger value="review"><CheckCircle2 className="mr-1 h-4 w-4" />{tx("Review", "Analyse")}</TabsTrigger><TabsTrigger value="edit"><Pencil className="mr-1 h-4 w-4" />{tx("CV content", "Contenu CV")}</TabsTrigger><TabsTrigger value="preview"><Eye className="mr-1 h-4 w-4" />{tx("Preview", "Aperçu")}</TabsTrigger></TabsList>
        <TabsContent value="review" className="space-y-6 pt-4">
          <div><h3 className="mb-3 font-semibold">{tx("Supported requirements", "Exigences justifiées")}</h3><div className="divide-y">{result.matches.map((match, index) => <div key={index} className="grid gap-2 py-3 sm:grid-cols-2"><p className="text-sm font-medium">{match.requirement}</p><p className="text-sm text-muted-foreground">{match.evidence}</p></div>)}</div></div>
          <Report title={tx("Missing or unconfirmed requirements", "Exigences manquantes ou à confirmer")} lines={result.gaps} />
          <Report title={tx("Editorial changes", "Adaptations rédactionnelles")} lines={result.changes} />
          <Report title={tx("Client submission requirements", "Conditions de présentation au client")} lines={result.submission_requirements} />
        </TabsContent>
        <TabsContent value="edit" className="space-y-5 pt-4">
          <div className="grid gap-3 sm:grid-cols-2"><Field label={tx("Candidate name", "Nom candidat")}><Input value={cv.full_name} onChange={(e) => update({ ...cv, full_name: e.target.value })} /></Field><Field label={tx("Professional title", "Titre professionnel")}><Input value={cv.role_title} onChange={(e) => update({ ...cv, role_title: e.target.value })} /></Field></div>
          <Field label={tx("Profile", "Profil")}><Textarea rows={5} value={cv.profile} onChange={(e) => update({ ...cv, profile: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={tx("Skills", "Compétences")}><Textarea rows={5} value={cv.skill_groups.join("\n")} onChange={(e) => update({ ...cv, skill_groups: e.target.value.split("\n") })} /></Field><Field label={tx("Languages", "Langues")}><Textarea rows={5} value={cv.languages.join("\n")} onChange={(e) => update({ ...cv, languages: e.target.value.split("\n") })} /></Field></div>
          <h3 className="font-semibold">{tx("Experience", "Expériences")}</h3>
          {cv.experiences.map((experience, index) => <div key={index} className="space-y-3 border-t py-4">
            <div className="grid gap-3 sm:grid-cols-3">{(["title", "company", "period"] as const).map((key) => <Field key={key} label={key === "title" ? tx("Position", "Poste") : key === "company" ? tx("Employer", "Employeur") : tx("Dates", "Dates")}><Input value={experience[key]} onChange={(e) => update({ ...cv, experiences: cv.experiences.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item) })} /></Field>)}</div>
            <Field label={tx("Project / context", "Projet / contexte")}><Textarea value={experience.description} onChange={(e) => update({ ...cv, experiences: cv.experiences.map((item, i) => i === index ? { ...item, description: e.target.value } : item) })} /></Field>
            <Field label={tx("Responsibilities", "Missions")}><Textarea rows={5} value={experience.bullets.join("\n")} onChange={(e) => update({ ...cv, experiences: cv.experiences.map((item, i) => i === index ? { ...item, bullets: e.target.value.split("\n") } : item) })} /></Field>
            <Field label={tx("Technical environment", "Environnement technique")}><Input value={experience.environment} onChange={(e) => update({ ...cv, experiences: cv.experiences.map((item, i) => i === index ? { ...item, environment: e.target.value } : item) })} /></Field>
          </div>)}
          <h3 className="font-semibold">{tx("Education", "Formation")}</h3>
          {cv.educations.map((education, index) => <div key={index} className="grid gap-3 border-t py-3 sm:grid-cols-2">{(["school", "title", "period", "location"] as const).map((key) => <Field key={key} label={{ school: tx("School", "Établissement"), title: tx("Qualification", "Diplôme"), period: "Dates", location: tx("Location", "Lieu") }[key]}><Input value={education[key]} onChange={(e) => update({ ...cv, educations: cv.educations.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item) })} /></Field>)}</div>)}
          <h3 className="font-semibold">{tx("Projects", "Projets")}</h3>
          {cv.projects.map((project, index) => <div key={index} className="space-y-3 border-t py-3">{(["name", "description", "technologies"] as const).map((key) => <Field key={key} label={{ name: tx("Project", "Projet"), description: "Description", technologies: "Technologies" }[key]}><Textarea value={project[key]} onChange={(e) => update({ ...cv, projects: cv.projects.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item) })} /></Field>)}</div>)}
        </TabsContent>
        <TabsContent value="preview" className="pt-4">{previewUrl ? <iframe title={tx("Aligned CV preview", "Aperçu du CV aligné")} src={previewUrl} className="h-[720px] max-h-[75vh] w-full rounded-md border bg-card" /> : <div className="flex min-h-52 items-center justify-center border bg-muted/40"><Button variant="outline" disabled={exporting} onClick={() => exportPdf(false)}><Eye className="mr-2 h-4 w-4" />{tx("Generate preview", "Générer l’aperçu")}</Button></div>}</TabsContent>
      </Tabs>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t bg-background py-4">
        <label className="mr-auto flex max-w-lg items-center gap-2 text-sm"><Switch checked={confirmed} onCheckedChange={setConfirmed} />{tx("I have verified the CV facts and client requirements.", "J’ai vérifié les informations du CV et les exigences client.")}</label>
        <Button variant="outline" disabled={exporting} onClick={() => exportPdf(false)}><Eye className="mr-2 h-4 w-4" />{tx("Preview", "Aperçu")}</Button>
        <Button disabled={!confirmed || exporting} onClick={() => exportPdf(true)}>{exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{tx("Download PDF", "Télécharger PDF")}</Button>
      </div>
    </> : null}
  </div>;
}

function UploadDocument({ title, file, onChange, disabled, fr }: { title: string; file: File | null; onChange: (file: File | null) => void; disabled: boolean; fr: boolean }) {
  return <label className="flex min-h-36 min-w-0 cursor-pointer flex-col items-start justify-center gap-2 rounded-md border border-dashed bg-card p-5 hover:border-primary"><span className="flex items-center gap-2 font-semibold"><FileText className="h-5 w-5 text-primary" />{title}</span><span className="flex max-w-full items-center gap-2 text-sm text-muted-foreground"><Upload className="h-4 w-4 shrink-0" /><span className="break-all">{file ? file.name : fr ? "Choisir un document" : "Choose a document"}</span></span><span className="text-xs text-muted-foreground">PDF · 10 {fr ? "Mo" : "MB"}</span><input type="file" aria-label={title} accept=".pdf,application/pdf" className="sr-only" disabled={disabled} onChange={(e) => onChange(e.target.files?.[0] ?? null)} /></label>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block min-w-0 space-y-1.5"><Label asChild><span className="text-xs">{label}</span></Label>{children}</label>; }
function Report({ title, lines }: { title: string; lines: string[] }) { return lines.length ? <div className="space-y-2 border-t pt-4"><h3 className="font-semibold">{title}</h3><ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">{lines.map((line, i) => <li key={i}>{line}</li>)}</ul></div> : null; }