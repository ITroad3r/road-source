import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { can } from "@/lib/permissions";
import { dossierSchema, validTestPdf, clearedSection } from "@/lib/candidate-dossier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CandidateDocumentPreview } from "./CandidateDocumentPreview";
type Dossier = Database["public"]["Tables"]["candidate_dossiers"]["Insert"];
type Section = "contact" | "screening";

export function CandidateDossier({ dcId, name, stage, roles }: { dcId: string; name: string; stage: string; roles: readonly string[] | undefined }) {
  const [open, setOpen] = useState(false);
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const canEdit = can(roles, "pipeline.dossier.edit");
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" variant="secondary" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
      {stage === "screened" ? <ClipboardCheck className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
      {fr ? "Contact / Évaluation" : "Contact / Screening"}
    </Button>
    <DialogContent className="w-[calc(100%-1rem)] max-w-3xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{name}</DialogTitle></DialogHeader>
      {open && <DossierLoader dcId={dcId} name={name} canEdit={canEdit} initialSection={stage === "screened" ? "screening" : "contact"} />}
    </DialogContent>
  </Dialog>;
}
function DossierLoader({ dcId, name, canEdit, initialSection }: { dcId: string; name: string; canEdit: boolean; initialSection: Section }) {
  const { data, isPending, error, refetch } = useQuery({ queryKey: ["candidate-dossier", dcId], queryFn: async () => {
    const result = await supabase.from("candidate_dossiers").select("*").eq("demand_candidate_id", dcId).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  } });
  if (isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (error) return <div role="alert">{error.message}<Button variant="outline" onClick={() => { void refetch(); }}>Retry</Button></div>;
  return <DossierForm dcId={dcId} name={name} canEdit={canEdit} initialSection={initialSection} initial={data ?? { demand_candidate_id: dcId }} />;
}
function DossierForm({ dcId, name, canEdit, initialSection, initial }: { dcId: string; name: string; canEdit: boolean; initialSection: Section; initial: Dossier }) {
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const text = (en: string, french: string) => fr ? french : en;
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Dossier>(initial);
  const [savedRecord, setSavedRecord] = useState<Dossier>(initial);
  const [files, setFiles] = useState<{ technical?: File; psychological?: File }>({});
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const set = (key: keyof Dossier, value: string | number | null) => setDraft(d => ({ ...d, [key]: value }));
  const field = (key: keyof Dossier, label: string, type = "text") => <div className="space-y-1.5"><Label htmlFor={`${dcId}-${key}`}>{label}</Label><Input id={`${dcId}-${key}`} type={type} value={String(draft[key] ?? "")} min={type === "number" ? 0 : undefined} onChange={e => set(key, type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null)} /></div>;
  const select = (key: keyof Dossier, label: string, options: [string, string][]) => <div className="space-y-1.5"><Label htmlFor={`${dcId}-${key}`}>{label}</Label><Select disabled={!canEdit || busy} value={String(draft[key] ?? "none")} onValueChange={value => set(key, value === "none" ? null : value)}><SelectTrigger id={`${dcId}-${key}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>;
  const observations = (key: "contact_observations" | "screening_observations") => <div className="space-y-1.5"><Label htmlFor={`${dcId}-${key}`}>Observations</Label><Textarea id={`${dcId}-${key}`} rows={4} value={draft[key] ?? ""} onChange={e => set(key, e.target.value || null)} /></div>;
  async function persist(section: Section, clear = false) {
    if (!canEdit || busy) return;
    if (clear && !window.confirm(text("Delete this section’s information and test uploads?", "Supprimer les informations et pièces jointes de cette section ?"))) return;
    const validation = dossierSchema.safeParse({ communication_method: draft.communication_method ?? null, employment_status: draft.employment_status ?? null, technical_score: draft.technical_score ?? null, psychological_score: draft.psychological_score ?? null, current_pay: draft.current_pay ?? null });
    if (!clear && !validation.success) return toast.error(text("Scores must be between 0 and 100; pay must be non-negative.", "Les scores doivent être entre 0 et 100 ; la rémunération doit être positive ou nulle."));
    setBusy(true);
    const uploaded: string[] = [];
    const obsolete: string[] = [];
    try {
      let payload: Dossier = { ...draft };
      if (clear) payload = { ...draft, ...clearedSection(section) };
      if (section === "screening") {
        for (const kind of ["technical", "psychological"] as const) {
          const key = `${kind}_pdf` as const;
          const file = files[kind];
          if (!clear && file) {
            if (!validTestPdf(file)) throw new Error(text("PDF only, maximum 10 MB", "PDF uniquement, 10 Mo maximum"));
            const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
            if (signature !== "%PDF-") throw new Error(text("Invalid PDF file", "Fichier PDF invalide"));
            const path = `${dcId}/${crypto.randomUUID()}.pdf`;
            const { error } = await supabase.storage.from("candidate-tests").upload(path, file, { contentType: "application/pdf" });
            if (error) throw error;
            uploaded.push(path); payload[key] = path;
          }
          if (savedRecord[key] && savedRecord[key] !== payload[key]) obsolete.push(savedRecord[key]);
        }
      }
      // Preserve the other section's saved data rather than saving unsaved fields from another tab.
      const keys = section === "contact" ? ["communication_method","communicated_at","employment_status","availability_notes","expected_joining_date","current_contract_type","current_pay","current_pay_type","currency","country","city","contact_observations"] : ["technical_score","psychological_score","technical_pdf","psychological_pdf","screening_observations"];
      const partial = Object.fromEntries(keys.map(key => [key, payload[key as keyof Dossier] ?? (key === "currency" ? "MAD" : null)]));
      const { error } = await supabase.from("candidate_dossiers").upsert({ demand_candidate_id: dcId, ...partial });
      if (error) throw error;
      uploaded.length = 0;
      if (obsolete.length) {
        const result = await supabase.storage.from("candidate-tests").remove(obsolete);
        if (result.error) toast.warning(text("Saved, but an old file could not be removed.", "Enregistré, mais un ancien fichier n’a pas pu être supprimé."));
      }
      const saved = await supabase.from("candidate_dossiers").select("*").eq("demand_candidate_id", dcId).single();
      if (saved.error) throw saved.error;
      setSavedRecord(saved.data);
      setDraft(saved.data); setFiles({}); setFileKey(k => k + 1);
      void qc.invalidateQueries({ queryKey: ["candidate-dossier", dcId] });
      toast.success(clear ? text("Section deleted", "Section supprimée") : text("Saved", "Enregistré"));
    } catch (e) {
      if (uploaded.length) await supabase.storage.from("candidate-tests").remove(uploaded);
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }
  const actions = (section: Section) => canEdit && <div className="flex justify-between gap-2 pt-3"><Button type="button" variant="outline" disabled={busy} onClick={() => { void persist(section, true); }}><Trash2 className="h-4 w-4 mr-1" />{text("Delete section", "Supprimer la section")}</Button><Button type="button" disabled={busy} onClick={() => { void persist(section); }}>{busy ? text("Saving…", "Enregistrement…") : text("Save", "Enregistrer")}</Button></div>;
  return <Tabs defaultValue={initialSection}>
    <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="contact">{text("Contacted", "Contacté")}</TabsTrigger><TabsTrigger value="screening">{text("For Screening/Approval", "Pour évaluation/approbation")}</TabsTrigger></TabsList>
    <TabsContent value="contact" className="space-y-4">
      <fieldset disabled={!canEdit || busy} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          {select("communication_method", text("Communication method", "Mode de communication"), [["phone",text("Phone","Téléphone")],["visio",text("Video call","Visio")],["whatsapp","WhatsApp"]])}
          <div className="space-y-1.5"><Label htmlFor={`${dcId}-communicated_at`}>{text("Communication date and time", "Date et heure de communication")}</Label><Input id={`${dcId}-communicated_at`} type="datetime-local" value={draft.communicated_at ? localDateTime(draft.communicated_at) : ""} onChange={e => set("communicated_at", e.target.value ? new Date(e.target.value).toISOString() : null)} /></div>
          {select("employment_status",text("Employment status","Situation professionnelle"),[["employed",text("Employed","Employé")],["unemployed",text("Unemployed","Sans emploi")]])}
          {field("expected_joining_date",text("Expected joining date","Date de disponibilité prévue"),"date")}
          {field("availability_notes",text("Availability / notice period","Disponibilité / préavis"))}
          {field("current_contract_type",text("Current contract type","Type de contrat actuel"))}
          {select("current_pay_type",text("Current remuneration type","Type de rémunération actuelle"),[["salary",text("Salary","Salaire")],["tjm","TJM"]])}
          {field("current_pay",text("Current salary / TJM","Salaire actuel / TJM"),"number")}
          {field("currency",text("Currency","Devise"))}
          {field("country",text("Country","Pays"))}{field("city",text("City","Ville"))}
        </div>
        {observations("contact_observations")}
      </fieldset>{actions("contact")}
    </TabsContent>
    <TabsContent value="screening" className="space-y-4">
      {(["technical","psychological"] as const).map(kind => {
        const scoreKey = `${kind}_score` as const;
        const pdfKey = `${kind}_pdf` as const;
        const label = kind === "technical" ? text("Technical test", "Test technique") : text("Psychological test", "Test psychologique");
        return <div key={kind} className="space-y-3 border-b pb-4">
          <fieldset disabled={!canEdit || busy} className="space-y-3">
            <Label htmlFor={`${dcId}-${scoreKey}`}>{label}</Label>
            <div className="flex items-center gap-2"><Input id={`${dcId}-${scoreKey}`} aria-label={`${label} score`} className="w-28" type="number" min={0} max={100} step="0.01" value={draft[scoreKey] ?? ""} onChange={e => set(scoreKey,e.target.value === "" ? null : Number(e.target.value))} /><span>%</span></div>
            {canEdit && <Input key={`${kind}-${fileKey}`} type="file" accept="application/pdf,.pdf" aria-label={`${label} PDF`} onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!validTestPdf(file)) { e.target.value = ""; return toast.error(text("PDF only, maximum 10 MB", "PDF uniquement, 10 Mo maximum")); }
              setFiles(f => ({ ...f, [kind]: file }));
            }} />}
          </fieldset>
          <div className="flex items-center gap-2 flex-wrap">
            {draft[pdfKey] && <CandidateDocumentPreview name={name} path={draft[pdfKey] ?? null} bucket="candidate-tests" label={`${label} PDF`} />}
            {canEdit && (draft[pdfKey] || files[kind]) && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { set(pdfKey,null); setFiles(f => { const next = { ...f }; delete next[kind]; return next; }); setFileKey(k => k+1); }}><Trash2 className="h-3 w-3 mr-1" />{text("Remove PDF", "Retirer le PDF")}</Button>}
          </div>
        </div>;
      })}
      <fieldset disabled={!canEdit || busy}>{observations("screening_observations")}</fieldset>{actions("screening")}
    </TabsContent>
  </Tabs>;
}
function localDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,16);
}
