import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMyRoles } from "@/hooks/useMyRoles";
import { useMemo, useState } from "react";
import { differenceInDays, format, subDays } from "date-fns";
import { BarChart3, Trophy, Clock, Users, TrendingUp, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reports & Analytics — Sourcing Hub" }] }),
  component: ReportsPage,
});

type Demand = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  client_id: string;
  clients: { name: string } | null;
};

type Candidate = {
  id: string;
  stage: string;
  created_at: string;
  updated_at: string;
  submitted_by: string | null;
  demand_id: string;
  cv_id: string;
};

type Profile = { id: string; full_name: string | null; email: string };

function ReportsPage() {
  const { user } = Route.useRouteContext();
  const { data: roles, isLoading: rolesLoading } = useMyRoles(user.id);
  const [rangeDays, setRangeDays] = useState<number>(90);

  const canView = roles?.some((r) => ["admin", "division_manager", "division_director", "ceo"].includes(r)) ?? false;

  const since = useMemo(() => subDays(new Date(), rangeDays).toISOString(), [rangeDays]);

  const { data: demands } = useQuery({
    queryKey: ["reports", "demands", rangeDays],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("id,title,status,created_at,updated_at,assigned_to,client_id,clients(name)")
        .gte("created_at", since);
      if (error) throw error;
      return data as unknown as Demand[];
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["reports", "candidates", rangeDays],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_candidates")
        .select("id,stage,created_at,updated_at,submitted_by,demand_id,cv_id")
        .gte("created_at", since);
      if (error) throw error;
      return data as Candidate[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["reports", "profiles"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,email");
      if (error) throw error;
      return data as Profile[];
    },
  });

  if (rolesLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!canView) {
    return (
      <div className="p-8">
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Reports are available to managers, directors, CEO, and admins.
        </CardContent></Card>
      </div>
    );
  }

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));

  // Sourcer performance: by submitted_by
  const sourcerStats = new Map<string, { submitted: number; interview: number; offer: number; placed: number; rejected: number }>();
  (candidates ?? []).forEach((c) => {
    const key = c.submitted_by ?? "unknown";
    const s = sourcerStats.get(key) ?? { submitted: 0, interview: 0, offer: 0, placed: 0, rejected: 0 };
    s.submitted += 1;
    if (c.stage === "interview") s.interview += 1;
    if (c.stage === "offer") s.offer += 1;
    if (c.stage === "placed") s.placed += 1;
    if (c.stage === "rejected") s.rejected += 1;
    sourcerStats.set(key, s);
  });
  const sourcerRows = Array.from(sourcerStats.entries())
    .map(([uid, s]) => ({
      name: profileMap.get(uid) ?? "Unknown",
      ...s,
      conversion: s.submitted > 0 ? (s.placed / s.submitted) * 100 : 0,
    }))
    .sort((a, b) => b.submitted - a.submitted);

  // Client win rates: per client - placed / closed demands
  const clientStats = new Map<string, { name: string; total: number; placed: number; lost: number; open: number }>();
  (demands ?? []).forEach((d) => {
    const key = d.client_id;
    const s = clientStats.get(key) ?? { name: d.clients?.name ?? "—", total: 0, placed: 0, lost: 0, open: 0 };
    s.total += 1;
    if (d.status === "placed") s.placed += 1;
    else if (d.status === "lost" || d.status === "closed") s.lost += 1;
    else s.open += 1;
    clientStats.set(key, s);
  });
  const clientRows = Array.from(clientStats.entries())
    .map(([id, s]) => ({
      id,
      ...s,
      winRate: s.placed + s.lost > 0 ? (s.placed / (s.placed + s.lost)) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Time-to-fill: avg days from demand created -> first 'placed' candidate updated
  const placedCandidatesByDemand = new Map<string, Candidate>();
  (candidates ?? []).forEach((c) => {
    if (c.stage === "placed") {
      const existing = placedCandidatesByDemand.get(c.demand_id);
      if (!existing || new Date(c.updated_at) < new Date(existing.updated_at)) {
        placedCandidatesByDemand.set(c.demand_id, c);
      }
    }
  });
  const fillTimes: number[] = [];
  (demands ?? []).forEach((d) => {
    const p = placedCandidatesByDemand.get(d.id);
    if (p) {
      const days = differenceInDays(new Date(p.updated_at), new Date(d.created_at));
      if (days >= 0) fillTimes.push(days);
    }
  });
  const avgTimeToFill = fillTimes.length ? Math.round(fillTimes.reduce((a, b) => a + b, 0) / fillTimes.length) : null;
  const medianTimeToFill = fillTimes.length
    ? fillTimes.sort((a, b) => a - b)[Math.floor(fillTimes.length / 2)]
    : null;

  // Overall funnel
  const stageCounts = (candidates ?? []).reduce((acc, c) => {
    acc[c.stage] = (acc[c.stage] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalSubmitted = candidates?.length ?? 0;
  const totalPlaced = stageCounts.placed ?? 0;
  const overallConversion = totalSubmitted > 0 ? (totalPlaced / totalSubmitted) * 100 : 0;

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-7 w-7" /> Reports & Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Sourcer performance, client win rates, and time-to-fill metrics.
          </p>
        </div>
        <div className="flex gap-2">
          {[30, 90, 180, 365].map((d) => (
            <button
              key={d}
              onClick={() => setRangeDays(d)}
              className={`text-sm px-3 py-1.5 rounded-md border transition ${
                rangeDays === d
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      <p className="text-xs text-muted-foreground">
        Showing data since {format(new Date(since), "MMM d, yyyy")}
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI icon={Target} label="Demands created" value={demands?.length ?? 0} />
        <KPI icon={Users} label="Candidates submitted" value={totalSubmitted} />
        <KPI icon={Trophy} label="Placements" value={totalPlaced} sub={`${overallConversion.toFixed(1)}% conv.`} />
        <KPI icon={Clock} label="Avg time-to-fill" value={avgTimeToFill ?? "—"} sub={medianTimeToFill !== null ? `median ${medianTimeToFill}d` : undefined} suffix={avgTimeToFill !== null ? "d" : ""} />
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Candidate funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {["identified", "submitted", "interview", "offer", "placed", "rejected"].map((stage) => {
              const count = stageCounts[stage] ?? 0;
              const pct = totalSubmitted > 0 ? (count / totalSubmitted) * 100 : 0;
              return (
                <div key={stage}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{stage}</span>
                    <span className="font-mono text-muted-foreground">{count} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sourcer performance */}
      <Card>
        <CardHeader><CardTitle className="text-base">Sourcer performance</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {sourcerRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No candidate submissions in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 pr-3">Sourcer</th>
                  <th className="text-right py-2 px-2">Submitted</th>
                  <th className="text-right py-2 px-2">Interview</th>
                  <th className="text-right py-2 px-2">Offer</th>
                  <th className="text-right py-2 px-2">Placed</th>
                  <th className="text-right py-2 px-2">Rejected</th>
                  <th className="text-right py-2 pl-2">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {sourcerRows.map((r) => (
                  <tr key={r.name} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="text-right font-mono">{r.submitted}</td>
                    <td className="text-right font-mono">{r.interview}</td>
                    <td className="text-right font-mono">{r.offer}</td>
                    <td className="text-right font-mono text-green-600 dark:text-green-400">{r.placed}</td>
                    <td className="text-right font-mono text-muted-foreground">{r.rejected}</td>
                    <td className="text-right">
                      <Badge variant="secondary" className="font-mono">{r.conversion.toFixed(1)}%</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Client win rates */}
      <Card>
        <CardHeader><CardTitle className="text-base">Client win rates</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {clientRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No demands in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 pr-3">Client</th>
                  <th className="text-right py-2 px-2">Demands</th>
                  <th className="text-right py-2 px-2">Open</th>
                  <th className="text-right py-2 px-2">Placed</th>
                  <th className="text-right py-2 px-2">Lost/Closed</th>
                  <th className="text-right py-2 pl-2">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      <Link to="/clients/$clientId" params={{ clientId: r.id }} className="hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="text-right font-mono">{r.total}</td>
                    <td className="text-right font-mono text-muted-foreground">{r.open}</td>
                    <td className="text-right font-mono text-green-600 dark:text-green-400">{r.placed}</td>
                    <td className="text-right font-mono text-muted-foreground">{r.lost}</td>
                    <td className="text-right">
                      <Badge variant="secondary" className="font-mono">
                        {r.placed + r.lost === 0 ? "—" : `${r.winRate.toFixed(0)}%`}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Time-to-fill detail */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Time-to-fill</CardTitle></CardHeader>
        <CardContent>
          {fillTimes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No placements yet in this period.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Metric label="Placements" value={fillTimes.length} />
              <Metric label="Avg days" value={avgTimeToFill ?? 0} />
              <Metric label="Median days" value={medianTimeToFill ?? 0} />
              <Metric label="Fastest" value={Math.min(...fillTimes)} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  sub,
  suffix,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <div className="text-2xl font-bold mt-1">
          {value}
          {suffix && <span className="text-base font-normal text-muted-foreground ml-1">{suffix}</span>}
        </div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}
