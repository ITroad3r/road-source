import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Calendar } from "lucide-react";
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
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: "primary" | "success" | "warning" | "danger";
}) {
  const accentBg =
    accent === "success" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
    accent === "warning" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" :
    accent === "danger" ? "bg-red-500/10 text-red-700 dark:text-red-300" :
    "bg-primary/10 text-primary";
  return (
    <Card>
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
}

export function DemandCard({ d, compact = false }: { d: DemandRow; compact?: boolean }) {
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

export { pickPrimaryRole } from "@/lib/permissions";
