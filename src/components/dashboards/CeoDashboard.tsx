import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { TrendingUp, Users, Briefcase, Target, BarChart3 } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { StatCard } from "./shared";

export function CeoDashboard({ fullName }: { fullName: string | null }) {
  const { data: demands } = useQuery({
    queryKey: ["ceo-dash", "demands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("demands").select("id,status,commercial_outcome,created_at,clients(name)");
      if (error) throw error;
      return data as { id: string; status: string; commercial_outcome: string; created_at: string; clients: { name: string } | null }[];
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["ceo-dash", "candidates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("demand_candidates").select("stage");
      if (error) throw error;
      return data as { stage: string }[];
    },
  });

  const { data: financials } = useQuery({
    queryKey: ["ceo-dash", "financials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_financials")
        .select("client_rate,candidate_rate,margin,placement_date,contract_duration_months");
      if (error) throw error;
      return data as { client_rate: number | null; candidate_rate: number | null; margin: number | null; placement_date: string | null; contract_duration_months: number | null }[];
    },
  });

  const open = (demands ?? []).filter((d) => d.status === "open" || d.status === "in_progress").length;
  const active = (candidates ?? []).filter((c) => !["placed","rejected","withdrawn"].includes(c.stage)).length;
  const placed = (candidates ?? []).filter((c) => c.stage === "placed").length;
  const totalCandidates = (candidates ?? []).length;
  const placementRate = totalCandidates ? Math.round((placed / totalCandidates) * 100) : 0;

  const pipelineValue = (financials ?? []).reduce((s, f) => {
    const days = (f.contract_duration_months ?? 1) * 21;
    return s + (f.client_rate ?? 0) * days;
  }, 0);

  // Revenue by month (last 6)
  const months = Array.from({ length: 6 }).map((_, i) => startOfMonth(subMonths(new Date(), 5 - i)));
  const revenueByMonth = months.map((m) => {
    const label = format(m, "MMM");
    const rev = (financials ?? []).filter((f) => f.placement_date && startOfMonth(new Date(f.placement_date)).getTime() === m.getTime())
      .reduce((s, f) => s + (f.client_rate ?? 0) * (f.contract_duration_months ?? 1) * 21, 0);
    return { month: label, revenue: Math.round(rev) };
  });

  const funnel = ["identified","submitted","screened","client_interview","offer","placed"].map((stage) => ({
    stage: stage.replace("_"," "),
    count: (candidates ?? []).filter((c) => c.stage === stage).length,
  }));

  return (
    <div className="p-8 space-y-6 bg-gradient-to-br from-background via-background to-primary/5 min-h-full">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executive overview{fullName ? ` · ${fullName.split(" ")[0]}` : ""}</h1>
          <p className="text-muted-foreground mt-1">Company performance across demand, pipeline and revenue.</p>
        </div>
        <Button asChild variant="outline"><Link to="/reports"><BarChart3 className="h-4 w-4 mr-2" />Detailed reports</Link></Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open demands" value={open} icon={Briefcase} accent="primary" />
        <StatCard label="Active candidates" value={active} icon={Users} accent="primary" />
        <StatCard label="Placement rate" value={`${placementRate}%`} icon={Target} accent="success" hint={`${placed} of ${totalCandidates}`} />
        <StatCard label="Pipeline value" value={`€${Math.round(pipelineValue).toLocaleString()}`} icon={TrendingUp} accent="success" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Revenue · last 6 months</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `€${v/1000}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} formatter={(v: number) => `€${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Pipeline funnel</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis type="category" dataKey="stage" stroke="hsl(var(--muted-foreground))" fontSize={12} width={90} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
