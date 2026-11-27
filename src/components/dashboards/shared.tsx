import { Link } from "@tanstack/react-router";
import { useTx } from "@/hooks/use-tx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { format } from "date-fns";

export type DemandRow = {
  id: string;
  title: string;
  description?: string | null;
  engagement?: "freelance" | "permanent";
  required_skills?: string[] | null;
  location?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  status: string;
  start_date?: string | null;
  priority?: number | null;
  created_at: string;
  assigned_to: string | null;
  positions_count?: number | null;
  clients: { name: string; industry?: string | null } | null;
};

export const statusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  on_hold: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  filled: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  to,
  search,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: "primary" | "success" | "warning" | "danger";
  /** Only pass when the viewer has the capability for the target page (checked with can()). */
  to?: string;
  search?: Record<string, string>;
}) {
  const accentBg =
    accent === "success" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
    accent === "warning" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" :
    accent === "danger" ? "bg-red-500/10 text-red-700 dark:text-red-300" :
    "bg-primary/10 text-primary";
  const body = (
    <Card className={to ? "h-full hover:shadow-md hover:border-primary/40 transition cursor-pointer" : "h-full"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          {Icon && (
            <div className={`h-7 w-7 rounded-md flex items-center justify-center ${accentBg}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
        <div className="text-2xl font-bold mt-2">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
  return to ? <Link to={to as any} search={search as any} className="block">{body}</Link> : body;
}

export function DashHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">{subtitle}</p>
      </div>
      {children && <div className="flex gap-2 flex-wrap">{children}</div>}
    </header>
  );
}

/** Loading / error / empty wrapper used by every dashboard panel. */
export function Panel({ title, icon: Icon, action, loading, error, empty, emptyText, children, className }: {
  title: string; icon?: React.ComponentType<{ className?: string }>; action?: React.ReactNode;
  loading?: boolean; error?: unknown; empty?: boolean; emptyText?: string; children?: React.ReactNode; className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-2">
        <CardTitle className="text-base flex items-center gap-2 min-w-0">{Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}<span className="truncate">{title}</span></CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t("common.loading")}</div>
        ) : error ? (
          <div role="alert" className="p-6 text-sm text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{t("dash.loadError")}</div>
        ) : empty ? (
          <div className="p-6 text-sm text-muted-foreground text-center">{emptyText ?? t("common.noData")}</div>
        ) : children}
      </CardContent>
    </Card>
  );
}

export function useAgo() {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith("fr") ? frLocale : undefined;
  return (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale });
}

export function DemandCard({ d, compact = false }: { d: DemandRow; compact?: boolean }) {
  const { tx } = useTx();
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
              <Badge variant="outline" className={statusColors[d.status] ?? ""}>{d.status.replace("_", " ")}</Badge>
              {d.engagement && <Badge variant="secondary" className="capitalize">{d.engagement}</Badge>}
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
                  {d.engagement === "freelance" ? "TJM" : tx("Salary", "Salaire")}: {d.budget_min ?? "?"} – {d.budget_max ?? "?"}
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

export { pickPrimaryRole } from "@/lib/permissions";
