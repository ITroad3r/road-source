import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, MapPin, Calendar, Building2, Users, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { useMyRoles, type AppRole } from "@/hooks/useMyRoles";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Dashboard — Sourcing Hub" }] }),
  component: Dashboard,
});

type DemandRow = {
  id: string;
  title: string;
  description: string | null;
  engagement: "freelance" | "permanent";
  required_skills: string[] | null;
  location: string | null;
  budget_min: number | null;
  budget_max: number | null;
  status: string;
  start_date: string | null;
  priority: number | null;
  created_at: string;
  assigned_to: string | null;
  clients: { name: string; industry: string | null } | null;
};

const statusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  sourcing: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  submitted: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  interview: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  offer: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  placed: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  closed: "bg-muted text-muted-foreground border-border",
  lost: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
};

function pickView(roles: AppRole[]): "admin" | "sales" | "sourcing" {
  if (roles.includes("admin") || roles.includes("manager")) return "admin";
  if (roles.includes("sales")) return "sales";
  return "sourcing";
}

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data: roles, isLoading: rolesLoading } = useMyRoles(user.id);

  if (rolesLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const view = pickView(roles ?? []);
  if (view === "admin") return <AdminManagerView />;
  if (view === "sales") return <SalesView userId={user.id} />;
  return <SourcingView userId={user.id} />;
}

/* ---------------- Admin / Manager ---------------- */

function AdminManagerView() {
  const { data: demands, isLoading } = useQuery({
    queryKey: ["dashboard", "all-demands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("id,title,status,engagement,priority,created_at,assigned_to,clients(name,industry)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DemandRow[];
    },
  });

  const { data: pipeline } = useQuery({
    queryKey: ["dashboard", "pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_candidates")
        .select("stage");
      if (error) throw error;
      return data as { stage: string }[];
    },
  });

  const { data: cvCount } = useQuery({
    queryKey: ["dashboard", "cv-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("talent_hub_cvs")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const statusCounts = demands?.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  const stageCounts = pipeline?.reduce((acc, p) => {
    acc[p.stage] = (acc[p.stage] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  const unassigned = demands?.filter((d) => !d.assigned_to && d.status !== "closed" && d.status !== "lost").length ?? 0;

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Team Overview</h1>
        <p className="text-muted-foreground mt-1">Company-wide view of demands, pipeline, and talent.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total demands" value={demands?.length ?? 0} icon={Briefcase} />
        <StatCard label="Open" value={statusCounts.open ?? 0} />
        <StatCard label="Unassigned" value={unassigned} />
        <StatCard label="Placed" value={statusCounts.placed ?? 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Candidate pipeline</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {["identified", "submitted", "interview", "offer", "placed", "rejected"].map((s) => (
                <div key={s} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{s}</span>
                  <span className="font-mono font-medium">{stageCounts[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Talent Hub</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{cvCount ?? 0}</div>
            <p className="text-sm text-muted-foreground mt-1">Total candidates in hub</p>
            <Link to="/talent-hub" className="text-sm text-primary hover:underline mt-3 inline-block">Browse talent hub →</Link>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent demands</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {demands?.slice(0, 10).map((d) => <DemandCard key={d.id} d={d} compact />)}
      </section>
    </div>
  );
}

/* ---------------- Sales ---------------- */

function SalesView({ userId }: { userId: string }) {
  const { data: demands, isLoading } = useQuery({
    queryKey: ["dashboard", "sales-demands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("id,title,description,engagement,required_skills,location,budget_min,budget_max,status,start_date,priority,created_at,assigned_to,clients(name,industry)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DemandRow[];
    },
  });

  const { data: clientCount } = useQuery({
    queryKey: ["dashboard", "client-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const mine = demands?.filter((d) => d.assigned_to === userId) ?? [];
  const counts = demands?.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Dashboard</h1>
          <p className="text-muted-foreground mt-1">All demands across the company and your portfolio.</p>
        </div>
        <Link to="/demands/new" className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90">+ New demand</Link>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="All demands" value={demands?.length ?? 0} />
        <StatCard label="My demands" value={mine.length} />
        <StatCard label="Clients" value={clientCount ?? 0} />
        <StatCard label="Placed" value={counts.placed ?? 0} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">All demands</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && demands?.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No demands yet.</CardContent></Card>
        )}
        {demands?.map((d) => <DemandCard key={d.id} d={d} />)}
      </section>
    </div>
  );
}

/* ---------------- Sourcing ---------------- */

function SourcingView({ userId }: { userId: string }) {
  const { data: demands, isLoading } = useQuery({
    queryKey: ["my-demands", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("id,title,description,engagement,required_skills,location,budget_min,budget_max,status,start_date,priority,created_at,assigned_to,clients(name,industry)")
        .eq("assigned_to", userId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DemandRow[];
    },
  });

  const counts = demands?.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">My Demands</h1>
        <p className="text-muted-foreground mt-1">Open requests assigned to you. Source candidates from the Talent Hub.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total assigned" value={demands?.length ?? 0} />
        <StatCard label="Open" value={counts.open ?? 0} />
        <StatCard label="In progress" value={(counts.sourcing ?? 0) + (counts.submitted ?? 0) + (counts.interview ?? 0)} />
        <StatCard label="Placed" value={counts.placed ?? 0} />
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && demands?.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No demands assigned to you yet.
            </CardContent>
          </Card>
        )}
        {demands?.map((d) => <DemandCard key={d.id} d={d} />)}
      </div>
    </div>
  );
}

/* ---------------- Shared ---------------- */

function DemandCard({ d, compact = false }: { d: DemandRow; compact?: boolean }) {
  return (
    <Link to="/demands/$demandId" params={{ demandId: d.id }} className="block">
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-lg">{d.title}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {d.clients?.name ?? "—"}
                {d.clients?.industry && <span className="opacity-60">· {d.clients.industry}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className={statusColors[d.status]}>{d.status}</Badge>
              <Badge variant="secondary" className="capitalize">{d.engagement}</Badge>
            </div>
          </div>
        </CardHeader>
        {!compact && (
          <CardContent className="space-y-3">
            {d.description && <p className="text-sm text-muted-foreground line-clamp-2">{d.description}</p>}
            <div className="flex flex-wrap gap-1.5">
              {d.required_skills?.slice(0, 8).map((s) => (
                <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
              {d.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{d.location}</span>}
              {(d.budget_min || d.budget_max) && (
                <span>
                  {d.engagement === "freelance" ? "TJM" : "Salary"}: {d.budget_min ?? "?"} – {d.budget_max ?? "?"}
                </span>
              )}
              {d.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(d.start_date), "MMM d, yyyy")}</span>}
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          {Icon && <Icon className="h-3 w-3" />} {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
