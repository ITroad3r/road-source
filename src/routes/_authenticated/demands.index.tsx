import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, MapPin, Calendar, Plus, Search, User, Filter } from "lucide-react";
import { format } from "date-fns";
import { useMyRoles } from "@/hooks/useMyRoles";

export const Route = createFileRoute("/_authenticated/demands/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Demands — RoadSource" }] }),
  component: DemandsList,
});

const DEMAND_STATUSES = ["open", "sourcing", "submitted", "interview", "offer", "placed", "closed", "lost"] as const;
type Status = (typeof DEMAND_STATUSES)[number];

const statusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  sourcing: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  submitted: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  interview: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  offer: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  placed: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  closed: "bg-muted text-muted-foreground border-border",
  lost: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
};

function DemandsList() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: roles } = useMyRoles(user.id);
  const canAssign = (roles ?? []).some((r) => ["admin", "division_manager"].includes(r));
  const canCreate = canAssign;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "me" | "unassigned">("all");

  const { data: demands, isLoading } = useQuery({
    queryKey: ["demands", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("*, clients(name, industry)")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sourcers } = useQuery({
    queryKey: ["sourcers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: canAssign,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, assigned_to }: { id: string; assigned_to: string | null }) => {
      const { error } = await supabase.from("demands").update({ assigned_to }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demands", "list"] });
      toast.success("Assignment updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("demands").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demands", "list"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (demands ?? []).filter((d: any) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (assigneeFilter === "me" && d.assigned_to !== user.id) return false;
      if (assigneeFilter === "unassigned" && d.assigned_to) return false;
      if (!q) return true;
      const hay = [
        d.title,
        d.description,
        d.location,
        d.clients?.name,
        ...(d.required_skills ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [demands, search, statusFilter, assigneeFilter, user.id]);

  const sourcerName = (id: string | null) => {
    if (!id) return null;
    const s = sourcers?.find((p) => p.id === id);
    return s?.full_name ?? s?.email ?? id.slice(0, 8);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Demands</h1>
          <p className="text-muted-foreground text-sm">
            {filtered.length} of {demands?.length ?? 0} demands
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/demands/new">
              <Plus className="h-4 w-4 mr-2" /> New demand
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search title, client, skills, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
            <SelectTrigger className="w-full md:w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {DEMAND_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={(v) => setAssigneeFilter(v as any)}>
            <SelectTrigger className="w-full md:w-44">
              <User className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No demands match your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((d: any) => (
            <Card key={d.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Link
                        to="/demands/$demandId"
                        params={{ demandId: d.id }}
                        className="font-semibold text-lg hover:underline truncate"
                      >
                        {d.title}
                      </Link>
                      <Badge variant="outline" className={statusColors[d.status]}>
                        {d.status}
                      </Badge>
                      <Badge variant="secondary" className="capitalize">
                        {d.engagement}
                      </Badge>
                      {d.priority <= 2 && (
                        <Badge variant="destructive">P{d.priority}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
                      {d.clients?.name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" /> {d.clients.name}
                        </span>
                      )}
                      {d.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {d.location}
                        </span>
                      )}
                      {d.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(d.start_date), "MMM d, yyyy")}
                        </span>
                      )}
                      {(d.budget_min || d.budget_max) && (
                        <span>
                          €{d.budget_min ?? "?"}–{d.budget_max ?? "?"}/day
                        </span>
                      )}
                    </div>
                    {d.required_skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {d.required_skills.slice(0, 8).map((s: string) => (
                          <Badge key={s} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                        {d.required_skills.length > 8 && (
                          <Badge variant="outline" className="text-xs">
                            +{d.required_skills.length - 8}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 lg:w-64 shrink-0">
                    {canAssign ? (
                      <>
                        <Select
                          value={d.assigned_to ?? "unassigned"}
                          onValueChange={(v) =>
                            assignMutation.mutate({
                              id: d.id,
                              assigned_to: v === "unassigned" ? null : v,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Assign to…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {sourcers?.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.full_name ?? p.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={d.status}
                          onValueChange={(v) =>
                            statusMutation.mutate({ id: d.id, status: v as Status })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs capitalize">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DEMAND_STATUSES.map((s) => (
                              <SelectItem key={s} value={s} className="capitalize">
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {d.assigned_to
                          ? `Assigned to ${sourcerName(d.assigned_to) ?? "—"}`
                          : "Unassigned"}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
