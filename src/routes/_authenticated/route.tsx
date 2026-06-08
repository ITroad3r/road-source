import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Users, LogOut, FilePlus, Euro, Shield, Briefcase, Building2, User, Bell, BarChart3, Menu } from "lucide-react";
import { RoadSourceLogo } from "@/components/RoadSourceLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMyRoles } from "@/hooks/useMyRoles";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const { data: roles } = useMyRoles(user.id);
  const isAdmin = roles?.includes("admin") ?? false;
  const canCreateDemand = !!roles?.some((r) => ["admin", "division_manager"].includes(r));
  const canSeeFinancials = !!roles?.some((r) => ["admin", "division_manager", "division_director", "ceo"].includes(r));
  const canSeeReports = canSeeFinancials;

  const navItems = [
    { to: "/dashboard", label: t("nav.myDemands"), icon: LayoutDashboard },
    { to: "/demands", label: t("nav.allDemands"), icon: Briefcase },
    ...(canCreateDemand ? [{ to: "/demands/new" as const, label: t("nav.newDemand"), icon: FilePlus }] : []),
    { to: "/clients", label: t("nav.clients"), icon: Building2 },
    { to: "/talent-hub", label: t("nav.talentHub"), icon: Users },
    ...(canSeeFinancials ? [{ to: "/financials" as const, label: t("nav.financials"), icon: Euro }] : []),
    ...(canSeeReports ? [{ to: "/reports" as const, label: t("nav.reports"), icon: BarChart3 }] : []),
    { to: "/notifications", label: t("nav.notifications"), icon: Bell },
    { to: "/profile", label: t("nav.profile"), icon: User },
    ...(isAdmin ? [{ to: "/admin/users" as const, label: t("nav.usersRoles"), icon: Shield }] : []),
  ] as const;

  const SidebarBody = (
    <>
      <div className="p-5 border-b border-sidebar-border">
        <Link to="/" className="block">
          <div className="flex items-center gap-2">
            <RoadSourceLogo showWordmark={false} />
            <div className="leading-tight">
              <div className="font-extrabold text-sm tracking-tight text-sidebar-foreground">RoadSource</div>
              <div className="text-[0.6rem] font-semibold tracking-[0.18em] text-sidebar-foreground/60">
                {t("nav.poweredBy")}
              </div>
            </div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <div className="px-2 text-xs text-sidebar-foreground/60 truncate" title={user.email ?? ""}>
          {user.email}
        </div>
        <Button variant="outline" size="sm" className="w-full justify-start bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" /> {t("common.signOut")}
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground flex-col">
        {SidebarBody}
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden flex flex-col">
        <header className="h-14 border-b bg-background/80 backdrop-blur sticky top-0 z-20 flex items-center px-3 sm:px-4 gap-2">
          {/* Mobile menu trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden -ml-1" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col">
              <SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle></SheetHeader>
              {SidebarBody}
            </SheetContent>
          </Sheet>

          {/* Mobile brand */}
          <Link to="/" className="md:hidden flex items-center gap-2 min-w-0">
            <RoadSourceLogo showWordmark={false} />
            <span className="font-extrabold text-sm tracking-tight truncate">RoadSource</span>
          </Link>

          <div className="flex-1" />
          <LanguageSwitcher />
          <NotificationsBell userId={user.id} />
        </header>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
