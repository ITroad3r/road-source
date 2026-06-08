import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Euro, TrendingUp, Target, Trophy, AlertTriangle, BarChart3 } from "lucide-react";
import { StatCard } from "./shared";

export function DirectorDashboard({ fullName }: { fullName: string | null }) {
  const { data: demands } = useQuery({
    queryKey: ["director-dash", "demands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("id,title,lifecycle,commercial_outcome,lost_reason,assigned_to,created_at,clients(name)");
      if (error) throw error;
      return (data as unknown as { id: string; title: string; lifecycle: string; commercial_outcome: string; lost_reason: string | null; assigned_to: string | null; created_at: string; clients: { name: string } | null }[])
        .map((d) => ({ ...d, status: d.lifecycle }));
    },
  });

  const { data: financials } = useQuery({
    queryKey: ["director-dash", "financials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_financials")
        .select("client_rate,candidate_rate,margin,placement_date,contract_duration_months");
      if (error) throw error;
      return data as { client_rate: number | null; candidate_rate: number | null; margin: number | null; placement_date: string | null; contract_duration_months: number | null }[];
    },
  });

  const won = (demands ?? []).filter((d) => d.commercial_outcome === "won").length;
  const lost = (demands ?? []).filter((d) => d.commercial_outcome === "lost").length;
  const pending = (demands ?? []).filter((d) => d.commercial_outcome === "pending").length;
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;

  const totalMargin = (financials ?? []).reduce((s, f) => {
    const m = f.margin ?? ((f.client_rate ?? 0) - (f.candidate_rate ?? 0));
    const days = (f.contract_duration_months ?? 1) * 21;
    return s + m * days;
  }, 0);
  const placements = (financials ?? []).filter((f) => f.placement_date).length;
  const avgMargin = placements ? Math.round(totalMargin / placements) : 0;

  const lostReasons = (demands ?? [])
    .filter((d) => d.commercial_outcome === "lost" && d.lost_reason)
    .reduce<Record<string, number>>((acc, d) => {
      const k = d.lost_reason!.trim().slice(0, 60);
      acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {});
  const topLost = Object.entries(lostReasons).sort((a,b) => b[1]-a[1]).slice(0,5);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Division performance{fullName ? ` · ${fullName.split(" ")[0]}` : ""}</h1>
          <p className="text-muted-foreground mt-1">Margins, win-rate and pipeline health across all demands.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/financials"><Euro className="h-4 w-4 mr-2" />Financials</Link></Button>
          <Button asChild><Link to="/reports"><BarChart3 className="h-4 w-4 mr-2" />Reports</Link></Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Win rate" value={`${winRate}%`} icon={Trophy} accent="success" hint={`${won} won · ${lost} lost`} />
        <StatCard label="Total margin (est.)" value={`€${Math.round(totalMargin).toLocaleString()}`} icon={Euro} accent="success" />
        <StatCard label="Avg margin / placement" value={`€${avgMargin.toLocaleString()}`} icon={Target} accent="primary" />
        <StatCard label="Pending outcome" value={pending} icon={TrendingUp} accent="warning" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Top reasons for lost deals</CardTitle></CardHeader>
          <CardContent>
            {topLost.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lost deals recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {topLost.map(([reason, count]) => (
                  <li key={reason} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-3">{reason}</span>
                    <Badge variant="outline" className="shrink-0">{count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent decisions needed</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(demands ?? []).filter((d) => d.commercial_outcome === "pending" && d.status === "in_progress").slice(0,8).map((d) => (
                <li key={d.id}>
                  <Link to="/demands/$demandId" params={{ demandId: d.id }} className="flex items-center justify-between p-3 hover:bg-accent">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{d.clients?.name ?? "—"}</div>
                    </div>
                    <Badge variant="outline">Review</Badge>
                  </Link>
                </li>
              ))}
              {(demands ?? []).filter((d) => d.commercial_outcome === "pending").length === 0 && (
                <li className="p-6 text-sm text-muted-foreground text-center">Everything reviewed.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
