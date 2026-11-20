import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Loader2 } from "lucide-react";
import { useMyRoles } from "@/hooks/useMyRoles";
import { workspacesFor, resolveWorkspace } from "@/lib/permissions";
import { SourcingDashboard } from "@/components/dashboards/SourcingDashboard";
import { ManagerDashboard } from "@/components/dashboards/ManagerDashboard";
import { DirectorDashboard } from "@/components/dashboards/DirectorDashboard";
import { CeoDashboard } from "@/components/dashboards/CeoDashboard";
import { AdminDashboard } from "@/components/dashboards/AdminDashboard";
import { CompensationQueueCard } from "@/components/dashboards/CompensationQueueCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { ws?: string } => (typeof s.ws === "string" ? { ws: s.ws } : {}),
  head: () => ({
    meta: [
      { title: "Dashboard — RoadSource" },
      { name: "description", content: "Your RoadSource workspace: demands, candidates and decisions for your role." },
      { property: "og:title", content: "Dashboard — RoadSource" },
      { property: "og:description", content: "Your RoadSource workspace for your role." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const { ws: requested } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard" });
  const { data: roles, isLoading, error } = useMyRoles(user.id);
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="p-4 md:p-8 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t("common.loading")}</div>;
  if (error) return <div role="alert" className="p-4 md:p-8 text-sm text-destructive">{t("dash.loadError")}</div>;

  const r = roles ?? [];
  const available = workspacesFor(r);
  const ws = resolveWorkspace(r, requested);
  if (!ws) {
    return (
      <div className="p-4 md:p-8"><Card><CardContent className="p-4 md:p-8 text-center space-y-3">
        <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t("dash.noRoleTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("dash.noRoleBody")}</p>
      </CardContent></Card></div>
    );
  }
  const fullName = profile?.full_name ?? null;

  return (
    <div className="p-4 md:p-8 space-y-4">
      {available.length > 1 && (
        <Tabs value={ws} onValueChange={(v) => navigate({ search: { ws: v }, replace: true })}>
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList aria-label={t("dash.workspace")}>
              {available.map((w) => <TabsTrigger key={w} value={w}>{t(`roles.${w}`)}</TabsTrigger>)}
            </TabsList>
          </div>
        </Tabs>
      )}
      {(ws === "sourceur" || ws === "hrbp" || ws === "operations") && <CompensationQueueCard queue={ws} userId={user.id} />}
      {ws === "sourceur" && <SourcingDashboard userId={user.id} fullName={fullName} roles={r} />}
      {ws === "hrbp" && <ManagerDashboard fullName={fullName} roles={r} />}
      {ws === "operations" && <DirectorDashboard fullName={fullName} roles={r} />}
      {ws === "ceo" && <CeoDashboard fullName={fullName} roles={r} />}
      {ws === "admin" && <AdminDashboard fullName={fullName} />}
    </div>
  );
}
