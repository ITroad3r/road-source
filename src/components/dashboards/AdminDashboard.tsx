import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, UserPlus, Users, AlertTriangle, History, UserX } from "lucide-react";
import { APP_ROLES } from "@/lib/permissions";
import { adminKpis } from "@/lib/dashboard-kpis";
import { StatCard, DashHeader, Panel, useAgo } from "./shared";

// Admin console: users, roles and access history only. Never queries business tables.
export function AdminDashboard({ fullName }: { fullName: string | null }) {
  const { t } = useTranslation();
  const ago = useAgo();
  const usersQ = useQuery({
    queryKey: ["admin-dash", "profiles"], staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,email,created_at").order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
  const rolesQ = useQuery({
    queryKey: ["admin-dash", "roles"], staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id,role");
      if (error) throw error; return data as { user_id: string; role: string }[];
    },
  });
  const auditQ = useQuery({
    queryKey: ["admin-dash", "audit"], staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("role_audit_log").select("id,target_user_id,role,action,actor_id,created_at").order("created_at", { ascending: false }).limit(10);
      if (error) throw error; return data;
    },
  });
  const users = usersQ.data ?? [];
  const k = adminKpis(users, rolesQ.data ?? [], APP_ROLES);
  const name = new Map(users.map((u) => [u.id, u.full_name || u.email || "—"]));
  const loading = usersQ.isLoading || rolesQ.isLoading;
  const recent = users.filter((u) => Date.now() - new Date(u.created_at).getTime() < 30 * 864e5);

  return (
    <div className="space-y-6">
      <DashHeader title={t("dash.admin.title", { name: fullName?.split(" ")[0] ?? "" })} subtitle={t("dash.admin.subtitle")}>
        <Button asChild><Link to="/admin/users"><UserPlus className="h-4 w-4 mr-2" />{t("nav.usersRoles")}</Link></Button>
      </DashHeader>

      {!loading && (k.singleAdmin || k.noRole.length > 0) && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm space-y-1">
          {k.singleAdmin && <div className="flex gap-2"><AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />{t("dash.admin.singleAdmin")}</div>}
          {k.noRole.length > 0 && <div className="flex gap-2"><UserX className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />{t("dash.admin.noRole", { count: k.noRole.length })}</div>}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label={t("dash.k.totalUsers")} value={loading ? "…" : k.total} icon={Users} to="/admin/users" />
        {APP_ROLES.map((r) => <StatCard key={r} label={t(`roles.${r}`)} value={loading ? "…" : k.byRole[r]} icon={Shield} to="/admin/users" />)}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={t("dash.admin.recent")} icon={UserPlus} loading={usersQ.isLoading} error={usersQ.error} empty={recent.length === 0} emptyText={t("dash.admin.noRecent")}>
          <ul className="divide-y">
            {recent.slice(0, 8).map((u) => {
              const rs = (rolesQ.data ?? []).filter((r) => r.user_id === u.id).map((r) => r.role);
              return (
                <li key={u.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0"><div className="text-sm font-medium truncate">{u.full_name || u.email}</div><div className="text-xs text-muted-foreground truncate">{u.email} · {ago(u.created_at)}</div></div>
                  <div className="flex gap-1 flex-wrap justify-end">{rs.length ? rs.map((r) => <Badge key={r} variant="secondary" className="text-[10px]">{t(`roles.${r}`, { defaultValue: r })}</Badge>) : <Badge variant="outline" className="text-[10px]">{t("dash.admin.noRoleBadge")}</Badge>}</div>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title={t("dash.admin.history")} icon={History} loading={auditQ.isLoading} error={auditQ.error} empty={(auditQ.data ?? []).length === 0}>
          <ul className="divide-y">
            {(auditQ.data ?? []).map((a) => (
              <li key={a.id} className="p-3 text-sm flex items-start justify-between gap-2">
                <span className="min-w-0 break-words">{t(a.action === "granted" ? "dash.admin.granted" : "dash.admin.revoked", { role: t(`roles.${a.role}`, { defaultValue: a.role }), user: name.get(a.target_user_id) ?? "—", actor: (a.actor_id && name.get(a.actor_id)) || t("dash.admin.system") })}</span>
                <span className="text-xs text-muted-foreground shrink-0">{ago(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
