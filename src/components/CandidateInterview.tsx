import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, fr as frLocale } from "date-fns/locale";
import { CalendarClock, CalendarIcon, Mail, Phone, MapPin, Video, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { can } from "@/lib/permissions";
import { interviewSchema } from "@/lib/candidate-interview";
import { useCandidateInterviews, type Interview } from "@/hooks/useCandidateInterviews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

type Props = { dcId: string; name: string; roles: readonly string[] | undefined; assigned?: boolean; trigger?: ReactNode };

export function CandidateInterview({ dcId, name, roles, assigned = false, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const allowed = can(roles, "interviews.view");
  const { data } = useCandidateInterviews(dcId, allowed);
  const editable = can(roles, "interviews.manage") && (roles?.includes("hrbp") === true || assigned);
  if (!allowed) return null;
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" variant={data?.length ? "outline" : "secondary"} size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
      <CalendarClock className="h-3 w-3 shrink-0" />{trigger ?? `${fr ? "Entretien" : "Interview"}${data?.length ? ` (${data.length})` : ""}`}
    </Button>
    <DialogContent className="w-[calc(100%-1rem)] max-w-xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{fr ? "Entretien client" : "Client interview"} — {name}</DialogTitle><DialogDescription>{fr ? "Rendez-vous avec le client" : "Appointments with the client"}</DialogDescription></DialogHeader>
      {open && <InterviewDetails dcId={dcId} editable={editable} />}
    </DialogContent>
  </Dialog>;
}

function InterviewDetails({ dcId, editable }: { dcId: string; editable: boolean }) {
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const text = (en: string, french: string) => fr ? french : en;
  const qc = useQueryClient();
  const { data, isPending, error, refetch } = useCandidateInterviews(dcId, true);
  const contacts = useQuery({ queryKey: ["interview-contacts", dcId], queryFn: async () => {
    const result = await supabase.from("demand_candidates").select("talent_hub_cvs(phone,email)").eq("id", dcId).single();
    if (result.error) throw result.error;
    return result.data.talent_hub_cvs;
  } });
  const [editing, setEditing] = useState<Interview | "new" | null>(null);
  const [deleting, setDeleting] = useState<Interview | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["candidate-interviews", dcId] }), qc.invalidateQueries({ queryKey: ["dash", "interviews"] })]);
  };
  async function remove() {
    if (!editable || !deleting || busy) return;
    setBusy(true);
    try {
      const result = await supabase.from("candidate_interviews").delete().eq("id", deleting.id).eq("demand_candidate_id", dcId).select("id").single();
      if (result.error) throw result.error;
      await refresh(); setDeleting(null);
      toast.success(text("Interview removed", "Entretien supprimé"));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  if (isPending) return <p className="text-sm text-muted-foreground">{text("Loading…", "Chargement…")}</p>;
  if (error) return <div role="alert" className="text-sm text-destructive">{text("Could not load interviews", "Impossible de charger les entretiens")}<Button variant="outline" onClick={() => { void refetch(); }}>{text("Retry", "Réessayer")}</Button></div>;
  const candidate = contacts.data;
  return <div className="space-y-5">
    <div className="border-b pb-4 space-y-2 text-sm">
      {contacts.isPending ? <p>{text("Loading contacts…", "Chargement des coordonnées…")}</p> : contacts.error ? <div role="alert" className="text-destructive">{text("Could not load candidate contacts", "Impossible de charger les coordonnées")}<Button variant="ghost" size="sm" onClick={() => { void contacts.refetch(); }}>{text("Retry", "Réessayer")}</Button></div> : <>
        <div className="flex items-center gap-2 min-w-0"><Phone className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-muted-foreground">{text("Mobile", "Mobile")}</span>{candidate?.phone ? <a className="text-primary break-all" href={`tel:${candidate.phone}`}>{candidate.phone}</a> : <span>{text("Not provided", "Non renseigné")}</span>}</div>
        <div className="flex items-center gap-2 min-w-0"><Mail className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-muted-foreground">Email</span>{candidate?.email ? <a className="text-primary break-all" href={`mailto:${candidate.email}`}>{candidate.email}</a> : <span>{text("Not provided", "Non renseigné")}</span>}</div>
      </>}
    </div>
    {data?.length === 0 && <p className="text-sm text-muted-foreground">{text("No interview scheduled", "Aucun entretien planifié")}</p>}
    <ul className="space-y-3">{data?.map(interview => <li key={interview.id} className="border rounded-md p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0"><p className="font-medium text-sm">{new Date(interview.starts_at).toLocaleString(fr ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}</p><p className="text-xs text-muted-foreground">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p></div>
        {editable && <div className="flex gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" title={text("Edit interview", "Modifier l’entretien")} aria-label={text("Edit interview", "Modifier l’entretien")} onClick={() => setEditing(interview)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title={text("Delete interview", "Supprimer l’entretien")} aria-label={text("Delete interview", "Supprimer l’entretien")} onClick={() => setDeleting(interview)}><Trash2 className="h-4 w-4" /></Button></div>}
      </div>
      {interview.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && <p className="text-xs text-muted-foreground">{new Date(interview.starts_at).toLocaleString(fr ? "fr-FR" : "en-GB", { timeZone: interview.timezone, dateStyle: "medium", timeStyle: "short" })} · {interview.timezone}</p>}
      <p className="flex items-center gap-2 text-sm">{interview.mode === "onsite" ? <MapPin className="h-4 w-4 shrink-0 text-primary" /> : <Video className="h-4 w-4 shrink-0 text-primary" />}{interview.mode === "onsite" ? text("On site", "Sur site") : text("Online / Visio", "En ligne / Visio")}</p>
      {interview.mode === "onsite" && interview.location && <p className="text-sm whitespace-pre-wrap break-words">{interview.location}</p>}
      {interview.mode === "online" && interview.meeting_url && <a className="text-sm text-primary underline break-all" href={interview.meeting_url} target="_blank" rel="noopener noreferrer">{text("Join meeting", "Rejoindre la réunion")}</a>}
      {interview.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{interview.notes}</p>}
    </li>)}</ul>
    {editable && (editing ? <InterviewForm key={editing === "new" ? "new" : editing.id} dcId={dcId} initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSaved={async () => { await refresh(); setEditing(null); }} /> : <Button variant="outline" onClick={() => setEditing("new")}><Plus className="h-4 w-4 mr-1" />{text("Schedule interview", "Planifier un entretien")}</Button>)}
    <AlertDialog open={deleting !== null} onOpenChange={value => { if (!value && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{text("Delete interview?", "Supprimer l’entretien ?")}</AlertDialogTitle><AlertDialogDescription>{text("This appointment will be removed from the candidate and daily dashboards.", "Ce rendez-vous sera supprimé du candidat et des tableaux de bord quotidiens.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>{text("Cancel", "Annuler")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void remove(); }}>{text("Delete", "Supprimer")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function InterviewForm({ dcId, initial, onCancel, onSaved }: { dcId: string; initial: Interview | null; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const text = (en: string, french: string) => fr ? french : en;
  const [date, setDate] = useState<Date | undefined>(initial ? new Date(initial.starts_at) : undefined);
  const [time, setTime] = useState(initial ? format(new Date(initial.starts_at), "HH:mm") : "");
  const [mode, setMode] = useState<"onsite" | "online">(initial?.mode === "onsite" ? "onsite" : "online");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [url, setUrl] = useState(initial?.meeting_url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!date || !/^\d{2}:\d{2}$/.test(time)) return toast.error(text("Choose a date and time", "Choisissez une date et une heure"));
    const datetime = new Date(`${format(date, "yyyy-MM-dd")}T${time}:00`);
    if (!Number.isFinite(datetime.getTime())) return toast.error(text("Invalid date and time", "Date et heure invalides"));
    const parsed = interviewSchema.safeParse({ starts_at: datetime.toISOString(), timezone: zone, mode, location: mode === "onsite" ? location : "", meeting_url: mode === "online" ? url : "", notes });
    if (!parsed.success) return toast.error(text("Check the interview details and meeting URL (http/https only)", "Vérifiez les détails et le lien de réunion (http/https uniquement)"));
    setBusy(true);
    try {
      const payload = { ...parsed.data, demand_candidate_id: dcId };
      const result = initial ? await supabase.from("candidate_interviews").update(payload).eq("id", initial.id).eq("demand_candidate_id", dcId).select("id").single() : await supabase.from("candidate_interviews").insert(payload).select("id").single();
      if (result.error) throw result.error;
      await onSaved(); toast.success(text("Interview saved", "Entretien enregistré"));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <form onSubmit={event => { void save(event); }} className="space-y-4 border-t pt-4">
    <h3 className="font-semibold text-sm">{initial ? text("Reschedule / edit interview", "Modifier l’entretien") : text("Schedule interview", "Planifier un entretien")}</h3>
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>{text("Interview date", "Date de l’entretien")}</Label><Popover open={calendarOpen} onOpenChange={setCalendarOpen}><PopoverTrigger asChild><Button aria-label={text("Interview date", "Date de l’entretien")} type="button" variant="outline" className="w-full justify-start font-normal"><CalendarIcon className="h-4 w-4 mr-2" />{date ? format(date, "PPP", { locale: fr ? frLocale : enUS }) : text("Choose date", "Choisir une date")}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={date} onSelect={value => { setDate(value); setCalendarOpen(false); }} locale={fr ? frLocale : enUS} className="pointer-events-auto" /></PopoverContent></Popover></div>
        <div className="space-y-1.5"><Label htmlFor={`interview-time-${dcId}`}>{text("Interview time", "Heure de l’entretien")}</Label><Input id={`interview-time-${dcId}`} type="time" required value={time} onChange={event => setTime(event.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">{text("Timezone", "Fuseau horaire")} : {zone}</p>
      <div className="space-y-1.5"><Label>{text("Interview format", "Format de l’entretien")}</Label><div role="group" aria-label={text("Interview format", "Format de l’entretien")} className="flex gap-2"><Button type="button" variant={mode === "onsite" ? "default" : "outline"} aria-pressed={mode === "onsite"} onClick={() => setMode("onsite")}><MapPin className="h-4 w-4 mr-1" />{text("On site", "Sur site")}</Button><Button type="button" variant={mode === "online" ? "default" : "outline"} aria-pressed={mode === "online"} onClick={() => setMode("online")}><Video className="h-4 w-4 mr-1" />{text("Online / Visio", "En ligne / Visio")}</Button></div></div>
      {mode === "onsite" ? <div className="space-y-1.5"><Label htmlFor={`interview-location-${dcId}`}>{text("Client address", "Adresse du client")}</Label><Input id={`interview-location-${dcId}`} maxLength={1000} value={location} onChange={event => setLocation(event.target.value)} /></div> : <div className="space-y-1.5"><Label htmlFor={`interview-url-${dcId}`}>{text("Meeting link", "Lien de réunion")}</Label><Input id={`interview-url-${dcId}`} type="url" maxLength={2000} value={url} onChange={event => setUrl(event.target.value)} /></div>}
      <div className="space-y-1.5"><Label htmlFor={`interview-notes-${dcId}`}>{text("Notes", "Observations")}</Label><Textarea id={`interview-notes-${dcId}`} maxLength={4000} rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></div>
    </fieldset>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{text("Cancel", "Annuler")}</Button><Button type="submit" disabled={busy}>{busy ? text("Saving…", "Enregistrement…") : text("Save interview", "Enregistrer l’entretien")}</Button></div>
  </form>;
}