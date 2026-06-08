import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Search, Send, Users, Clock, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { StatCard, DemandCard, type DemandRow } from "./shared";

export function SourcingDashboard({ userId, fullName }: { userId: string; fullName: string | null }) {
  const { data: demands, isLoading } = useQuery({
    queryKey: ["sourcing-dash", "my-demands", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("id,title,description,engagement,required_skills,location,budget_min,budget_max,status,lifecycle,start_date,priority,created_at,assigned_to,positions_count,clients(name,industry)")
        .eq("assigned_to", userId)
        .in("lifecycle", ["open", "in_progress"])
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as (DemandRow & { lifecycle: string })[]).map((d) => ({ ...d, status: d.lifecycle }));
    },
  });

  const { data: myCandidates } = useQuery({
    queryKey: ["sourcing-dash", "my-candidates", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_candidates")
        .select("id,stage,created_at,demand_id,cv_id,demands(title),talent_hub_cvs(full_name)")
        .eq("submitted_by", userId)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as unknown as {
        id: string; stage: string; created_at: string; demand_id: string;
        demands: { title: string } | null; talent_hub_cvs: { full_name: string } | null;
      }[];
    },
  });

  const stageCounts = (myCandidates ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.stage] = (acc[c.stage] ?? 0) + 1; return acc;
  }, {});

  const newToday = (demands ?? []).filter((d) => {
    const h = (Date.now() - new Date(d.created_at).getTime()) / 36e5;
    return h < 24;
  }).length;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hi {fullName?.split(" ")[0] ?? "there"}, ready to source?</h1>
          <p className="text-muted-foreground mt-1">Your assigned demands and the candidates you've moved through the pipeline.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/talent-hub"><Search className="h-4 w-4 mr-2" />Search Talent Hub</Link></Button>
          <Button asChild><Link to="/talent-hub/new"><Users className="h-4 w-4 mr-2" />Add candidate</Link></Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active demands" value={demands?.length ?? 0} icon={Briefcase} accent="primary" hint={newToday ? `${newToday} new today` : "All caught up"} />
        <StatCard label="Submitted" value={stageCounts.submitted ?? 0} icon={Send} accent="warning" hint="Awaiting manager review" />
        <StatCard label="In interview" value={stageCounts.client_interview ?? 0} icon={Clock} accent="primary" />
        <StatCard label="Placed" value={stageCounts.placed ?? 0} icon={CheckCircle2} accent="success" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Demands assigned to you</h2>
            <Link to="/demands" className="text-xs text-primary hover:underline">All demands →</Link>
          </div>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && demands?.length === 0 && (
            <Card><CardContent className="p-4 md:p-8 text-center text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No demands assigned to you yet. Your manager will dispatch new requests here.
            </CardContent></Card>
          )}
          {demands?.slice(0, 6).map((d) => <DemandCard key={d.id} d={d} />)}
        </section>

        <aside className="space-y-3">
          <h2 className="text-lg font-semibold">My recent submissions</h2>
          <Card>
            <CardContent className="p-0">
              {(myCandidates ?? []).length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">Nothing submitted yet.</div>
              ) : (
                <ul className="divide-y">
                  {(myCandidates ?? []).map((c) => (
                    <li key={c.id} className="p-3">
                      <Link to="/demands/$demandId" params={{ demandId: c.demand_id }} className="block hover:bg-accent rounded-md p-2 -m-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium truncate">{c.talent_hub_cvs?.full_name ?? "Candidate"}</div>
                          <Badge variant="outline" className="text-[10px]">{c.stage.replace("_", " ")}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{c.demands?.title} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
