import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Users, LogOut, FilePlus, Euro, Shield, Briefcase, Building2, User, Bell, BarChart3 } from "lucide-react";
import { RoadSourceLogo } from "@/components/RoadSourceLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMyRoles } from "@/hooks/useMyRoles";
import { NotificationsBell } from "@/components/NotificationsBell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = Route.useRouteContext();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const { data: roles } = useMyRoles(user.id);
  const isAdmin = roles?.includes("admin") ?? false;

  const navItems = [
    { to: "/dashboard", label: "My Demands", icon: LayoutDashboard },
    { to: "/demands", label: "All Demands", icon: Briefcase },
    { to: "/demands/new", label: "New Demand", icon: FilePlus },
    { to: "/clients", label: "Clients", icon: Building2 },
    { to: "/talent-hub", label: "Talent Hub", icon: Users },
    { to: "/financials", label: "Financials", icon: Euro },
    { to: "/notifications", label: "Notifications", icon: Bell },
    { to: "/profile", label: "Profile", icon: User },
    ...(isAdmin ? [{ to: "/admin/users" as const, label: "Users & roles", icon: Shield }] : []),
  ] as const;

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-5 border-b border-sidebar-border">
          <Link to="/" className="block">
            <div className="flex items-center gap-2">
              <RoadSourceLogo showWordmark={false} />
              <div className="leading-tight">
                <div className="font-extrabold text-sm tracking-tight text-sidebar-foreground">RoadSource</div>
                <div className="text-[0.6rem] font-semibold tracking-[0.18em] text-sidebar-foreground/60">
                  POWERED BY IT ROAD
                </div>
              </div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="px-2 text-xs text-sidebar-foreground/60 truncate" title={user.email ?? ""}>
            {user.email}
          </div>
          <Button variant="outline" size="sm" className="w-full justify-start bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto flex flex-col">
        <header className="h-14 border-b bg-background/80 backdrop-blur sticky top-0 z-10 flex items-center justify-end px-4 gap-2">
          <NotificationsBell userId={user.id} />
        </header>
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
