import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Mail, ExternalLink, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/talent-hub")({
  ssr: false,
  head: () => ({ meta: [{ title: "Talent Hub — Sourcing Hub" }] }),
  component: TalentHub,
});

type CV = {
  id: string;
  full_name: string;
  email: string | null;
  headline: string | null;
  summary: string | null;
  skills: string[] | null;
  years_experience: number | null;
  seniority: string | null;
  location: string | null;
  availability: string | null;
  engagement_preference: string | null;
  daily_rate: number | null;
  salary_expectation: number | null;
  cv_url: string | null;
  linkedin_url: string | null;
};

function TalentHub() {
  const [q, setQ] = useState("");
  const [engagement, setEngagement] = useState<string>("all");
  const [availability, setAvailability] = useState<string>("all");
  const [seniority, setSeniority] = useState<string>("all");

  const { data: cvs, isLoading } = useQuery({
    queryKey: ["talent-hub"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talent_hub_cvs")
        .select("id,full_name,email,headline,summary,skills,years_experience,seniority,location,availability,engagement_preference,daily_rate,salary_expectation,cv_url,linkedin_url")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as CV[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (cvs ?? []).filter((c) => {
      if (engagement !== "all" && c.engagement_preference !== engagement) return false;
      if (availability !== "all" && c.availability !== availability) return false;
      if (seniority !== "all" && c.seniority !== seniority) return false;
      if (!term) return true;
      const hay = [
        c.full_name,
        c.headline ?? "",
        c.summary ?? "",
        c.location ?? "",
        (c.skills ?? []).join(" "),
      ].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [cvs, q, engagement, availability, seniority]);

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Talent Hub</h1>
        <p className="text-muted-foreground mt-1">Search the candidate database by skill, role, location or availability.</p>
      </header>

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, skill, headline, location…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={engagement} onValueChange={setEngagement}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="Engagement" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All engagements</SelectItem>
              <SelectItem value="freelance">Freelance</SelectItem>
              <SelectItem value="permanent">Permanent</SelectItem>
            </SelectContent>
          </Select>
          <Select value={availability} onValueChange={setAvailability}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="Availability" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any availability</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="available_soon">Available soon</SelectItem>
              <SelectItem value="unavailable">Unavailable</SelectItem>
            </SelectContent>
          </Select>
          <Select value={seniority} onValueChange={setSeniority}>
            <SelectTrigger className="md:w-40"><SelectValue placeholder="Seniority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="junior">Junior</SelectItem>
              <SelectItem value="mid">Mid</SelectItem>
              <SelectItem value="senior">Senior</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="principal">Principal</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {isLoading ? "Loading…" : `${filtered.length} candidate${filtered.length === 1 ? "" : "s"}`}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((c) => (
          <Card key={c.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.full_name}</div>
                    <div className="text-sm text-muted-foreground truncate">{c.headline ?? "—"}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {c.availability && (
                    <Badge variant={c.availability === "available" ? "default" : "secondary"} className="text-xs capitalize">
                      {c.availability.replace("_", " ")}
                    </Badge>
                  )}
                  {c.seniority && <Badge variant="outline" className="text-xs capitalize">{c.seniority}</Badge>}
                </div>
              </div>

              {c.skills && c.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.skills.slice(0, 10).map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {c.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.location}</span>}
                {c.years_experience != null && <span>{c.years_experience} yrs exp</span>}
                {c.daily_rate != null && <span>TJM: €{c.daily_rate}</span>}
                {c.salary_expectation != null && <span>Salary: €{c.salary_expectation}</span>}
              </div>

              <div className="flex items-center gap-3 pt-1 text-sm">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-primary hover:underline">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </a>
                )}
                {c.linkedin_url && (
                  <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
                {c.cv_url && (
                  <a href={c.cv_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> CV
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && filtered.length === 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="p-10 text-center text-muted-foreground">
              No candidates match the current filters.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
