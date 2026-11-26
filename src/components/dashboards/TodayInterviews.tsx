import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CalendarClock, MapPin, Video } from "lucide-react";
import { localDayBounds } from "@/lib/candidate-interview";
import { useDashInterviews } from "./data";
import { CandidateInterview } from "@/components/CandidateInterview";
import { Button } from "@/components/ui/button";

export function TodayInterviews({ roles, assigned }: { roles: readonly string[]; assigned: boolean }) {
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const { start, end } = localDayBounds(now);
  const { data, isPending, error, refetch } = useDashInterviews(roles, start, end);
  return <section className="space-y-3 border-b pb-5" aria-label={fr ? "Entretiens du jour" : "Today's client interviews"}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5 text-primary" />{fr ? "Entretiens du jour" : "Today's client interviews"}{data ? ` (${data.length})` : ""}</h2><span className="text-xs text-muted-foreground">{now.toLocaleDateString(fr ? "fr-FR" : "en-GB")} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div>
    {isPending ? <p className="text-sm text-muted-foreground">{fr ? "Chargement…" : "Loading…"}</p> : error ? <div role="alert" className="text-sm text-destructive">{fr ? "Impossible de charger les entretiens" : "Could not load interviews"}<Button variant="outline" size="sm" onClick={() => { void refetch(); }}>{fr ? "Réessayer" : "Retry"}</Button></div> : !data?.length ? <p className="text-sm text-muted-foreground">{fr ? "Aucun entretien client aujourd’hui" : "No client interviews today"}</p> : <ul className="grid gap-3 lg:grid-cols-2">{data.map(interview => {
      const dc = interview.demand_candidates;
      const name = dc?.talent_hub_cvs?.full_name ?? (fr ? "Candidat" : "Candidate");
      return <li key={interview.id} className="border rounded-md bg-card p-3 flex flex-wrap items-center gap-3 min-w-0">
        <div className="font-semibold text-primary text-lg shrink-0">{new Date(interview.starts_at).toLocaleTimeString(fr ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
        <div className="flex-1 min-w-0"><p className="font-medium text-sm break-words">{name}</p>{dc && <Link to="/demands/$demandId" params={{ demandId: dc.demand_id }} className="text-xs text-muted-foreground hover:text-primary block break-words">{dc.demands?.clients?.name} · {dc.demands?.title}</Link>}<p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">{interview.mode === "onsite" ? <MapPin className="h-3 w-3" /> : <Video className="h-3 w-3" />}{interview.mode === "onsite" ? (fr ? "Sur site" : "On site") : (fr ? "En ligne / Visio" : "Online / Visio")}</p></div>
        <CandidateInterview dcId={interview.demand_candidate_id} name={name} roles={roles} assigned={assigned} trigger={fr ? "Détails" : "Details"} />
      </li>;
    })}</ul>}
  </section>;
}