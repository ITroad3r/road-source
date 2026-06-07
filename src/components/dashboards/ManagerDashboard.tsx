import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Briefcase, UserCheck, Send, AlertCircle, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { StatCard, type DemandRow } from "./shared";

export function ManagerDashboard({ fullName }: { fullName: string | null }) {
  const { data: demands, isLoading } = useQuery({
    queryKey: ["manager-dash", "demands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("id,title,lifecycle,commercial_outcome,assigned_to,created_at,positions_count,clients(name,industry)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as { id: string; title: string; lifecycle: string; commercial_outcome: string; assigned_to: string | null; created_at: string; positions_count: number | null; clients: { name: string; industry: string | null } | null }[])
        .map((d) => ({ ...d, status: d.lifecycle }));
    },
  });

  const { data: pendingReview } = useQuery({
    queryKey: ["manager-dash", "pending-screening"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_candidates")
        .select("id,stage,created_at,demand_id,cv_id,demands(title,clients(name)),talent_hub_cvs(full_name,headline)")
        .in("stage", ["submitted", "screened"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as unknown as {
        id: string; stage: string; created_at: string; demand_id: string;
        demands: { title: string; clients: { name: string } | null } | null;
        talent_hub_cvs: { full_name: string; headline: string | null } | null;
      }[];
    },
  });

  const awaitingDispatch = (demands ?? []).filter((d) => !d.assigned_to && d.status !== "cancelled" && d.status !== "filled");
  const inProgress = (demands ?? []).filter((d) => d.status === "in_progress").length;
  const open = (demands ?? []).filter((d) => d.status === "open").length;
  const placed = (demands ?? []).filter((d) => d.status === "filled").length;

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back{fullName ? `, ${fullName.split(" ")[0]}` : ""}.</h1>
          <p className="text-muted-foreground mt-1">Capture client demands, dispatch sourcing, screen candidates, and ship packages to clients.</p>
        </div>
        <Button asChild size="lg"><Link to="/demands/new"><Plus className="h-4 w-4 mr-2" />New demand</Link></Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open" value={open} icon={Briefcase} accent="primary" />
        <StatCard label="Awaiting dispatch" value={awaitingDispatch.length} icon={AlertCircle} accent={awaitingDispatch.length ? "warning" : "primary"} hint="Not yet assigned to a sourcer" />
        <StatCard label="In progress" value={inProgress} icon={Send} accent="primary" />
        <StatCard label="Filled" value={placed} icon={UserCheck} accent="success" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-600" /> Awaiting dispatch</CardTitle>
            <Link to="/demands" className="text-xs text-primary hover:underline">All demands →</Link>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && awaitingDispatch.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">No demands waiting — every request is assigned.</div>
            )}
            <ul className="divide-y">
              {awaitingDispatch.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <Link to="/demands/$demandId" params={{ demandId: d.id }} className="flex items-center justify-between p-3 hover:bg-accent">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {d.clients?.name ?? "—"} · {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2 shrink-0">Dispatch <ArrowRight className="h-3 w-3 ml-1" /></Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4 text-primary" /> Candidates awaiting screening</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(pendingReview ?? []).length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No pending screenings.</div>
            ) : (
              <ul className="divide-y">
                {(pendingReview ?? []).map((c) => (
                  <li key={c.id}>
                    <Link to="/demands/$demandId" params={{ demandId: c.demand_id }} className="flex items-center justify-between p-3 hover:bg-accent">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.talent_hub_cvs?.full_name ?? "Candidate"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.demands?.title} · {c.demands?.clients?.name ?? "—"}
                        </div>
                      </div>
                      <Badge variant="outline" className="ml-2 shrink-0 capitalize">{c.stage.replace("_", " ")}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">Active demands</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(demands ?? []).filter((d) => ["open","in_progress"].includes(d.status)).slice(0,8).map((d) => (
                <li key={d.id}>
                  <Link to="/demands/$demandId" params={{ demandId: d.id }} className="flex items-center justify-between p-3 hover:bg-accent">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{d.clients?.name ?? "—"}</div>
                    </div>
                    <Badge variant="outline" className="capitalize">{d.status.replace("_"," ")}</Badge>
                  </Link>
                </li>
              ))}
              {(demands ?? []).length === 0 && <li className="p-6 text-sm text-muted-foreground text-center">No demands yet.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/demands/new"><Plus className="h-4 w-4 mr-2" />New demand</Link></Button>
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/clients"><Briefcase className="h-4 w-4 mr-2" />Manage clients</Link></Button>
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/talent-hub">Browse Talent Hub</Link></Button>
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/financials">Financial review</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
