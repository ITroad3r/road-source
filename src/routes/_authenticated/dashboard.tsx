import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, UserPlus, Briefcase, Euro, BarChart3 } from "lucide-react";
import { useMyRoles } from "@/hooks/useMyRoles";
import { pickPrimaryRole } from "@/components/dashboards/shared";
import { SourcingDashboard } from "@/components/dashboards/SourcingDashboard";
import { ManagerDashboard } from "@/components/dashboards/ManagerDashboard";
import { DirectorDashboard } from "@/components/dashboards/DirectorDashboard";
import { CeoDashboard } from "@/components/dashboards/CeoDashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Dashboard — RoadSource" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data: roles, isLoading: rolesLoading } = useMyRoles(user.id);
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (rolesLoading) return <div className="p-4 md:p-8 text-sm text-muted-foreground">Loading…</div>;

  if (!roles || roles.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <Card>
          <CardContent className="p-4 md:p-8 text-center space-y-3">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">No role assigned yet</h2>
            <p className="text-sm text-muted-foreground">Ask an admin to assign you a role so you can start using RoadSource.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primary = pickPrimaryRole(roles);
  const fullName = profile?.full_name ?? null;

  switch (primary) {
    case "admin":     return <AdminDashboard fullName={fullName} />;
    case "ceo":       return <CeoDashboard fullName={fullName} />;
    case "operations": return <DirectorDashboard fullName={fullName} />;
    case "hrbp":       return <ManagerDashboard fullName={fullName} />;
    case "sourceur":
    default:          return <SourcingDashboard userId={user.id} fullName={fullName} />;
  }
}

function AdminDashboard({ fullName }: { fullName: string | null }) {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-7 w-7" /> Admin console{fullName ? ` · ${fullName.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">Manage users, roles and account access. Business data requires a business role.</p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ShortcutCard to="/admin/users" icon={UserPlus} title="Users & roles" body="Invite people, assign roles, manage access." />
      </div>

    </div>
  );
}

function ShortcutCard({ to, icon: Icon, title, body }: { to: string; icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-4 w-4" /></div>
          <h3 className="font-semibold">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{body}</p>
        <Button asChild size="sm" variant="outline" className="w-full"><Link to={to as any}>Open</Link></Button>
      </CardContent>
    </Card>
  );
}
