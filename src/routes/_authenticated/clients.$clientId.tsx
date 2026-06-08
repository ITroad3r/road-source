import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, MapPin, Calendar, Mail, Phone, User, Briefcase } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Client — RoadSource" }] }),
  component: ClientDetail,
});

const statusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  sourcing: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  submitted: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  interview: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  offer: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  placed: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  closed: "bg-muted text-muted-foreground border-border",
  lost: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
};

function ClientDetail() {
  const { clientId } = Route.useParams();

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: demands, isLoading: demandsLoading } = useQuery({
    queryKey: ["client-demands", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: candidateCounts } = useQuery({
    queryKey: ["client-demand-candidates", clientId],
    queryFn: async () => {
      const demandIds = (demands ?? []).map((d: any) => d.id);
      if (demandIds.length === 0) return {} as Record<string, number>;
      const { data, error } = await supabase.from("demand_candidates").select("demand_id").in("demand_id", demandIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const c of data ?? []) counts[c.demand_id] = (counts[c.demand_id] ?? 0) + 1;
      return counts;
    },
    enabled: (demands ?? []).length > 0,
  });

  if (clientLoading) return <div className="p-4 md:p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!client) return <div className="p-4 md:p-8">Client not found.</div>;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/clients"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Clients</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{client.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {client.industry && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {client.industry}
              </span>
            )}
            {client.contact_name && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {client.contact_name}
              </span>
            )}
            {client.contact_email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                <a href={`mailto:${client.contact_email}`} className="hover:text-primary transition-colors">
                  {client.contact_email}
                </a>
              </span>
            )}
            {client.contact_phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {client.contact_phone}
              </span>
            )}
          </div>
          {client.notes && (
            <div className="text-sm whitespace-pre-wrap border-t pt-4">
              {client.notes}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Demand History ({demands?.length ?? 0})</h2>
      </div>

      {demandsLoading ? (
        <div className="text-sm text-muted-foreground">Loading demands…</div>
      ) : demands?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No demands yet for this client.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {demands?.map((d: any) => (
            <Card key={d.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Link
                        to="/demands/$demandId"
                        params={{ demandId: d.id }}
                        className="font-semibold text-lg hover:underline truncate"
                      >
                        {d.title}
                      </Link>
                      <Badge variant="outline" className={statusColors[d.status]}>
                        {d.status}
                      </Badge>
                      <Badge variant="secondary" className="capitalize">
                        {d.engagement}
                      </Badge>
                      {d.priority <= 2 && <Badge variant="destructive">P{d.priority}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
                      {d.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {d.location}
                        </span>
                      )}
                      {d.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(d.start_date), "MMM d, yyyy")}
                        </span>
                      )}
                      {(d.budget_min || d.budget_max) && (
                        <span>€{d.budget_min ?? "?"}–{d.budget_max ?? "?"}/day</span>
                      )}
                      {d.assigned_to && (
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {profiles?.find((p) => p.id === d.assigned_to)?.full_name ?? "—"}
                        </span>
                      )}
                    </div>
                    {d.required_skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {d.required_skills.slice(0, 8).map((s: string) => (
                          <Badge key={s} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                        {d.required_skills.length > 8 && (
                          <Badge variant="outline" className="text-xs">
                            +{d.required_skills.length - 8}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 lg:w-auto shrink-0">
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5" />
                      {candidateCounts?.[d.id] ?? 0} candidates
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
