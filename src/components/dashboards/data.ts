import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { can } from "@/lib/permissions";
import type { Cand, Dem, Fin } from "@/lib/dashboard-kpis";

// Shared, cached dashboard reads. RLS scopes every row to the caller.
// Financial rows are only requested when the caller has financials.view (no request otherwise).
export type DemRow = Dem & { title: string; clients: { name: string } | null };
export type CandRow = Cand & { talent_hub_cvs: { full_name: string } | null; demands: { title: string } | null };

export function useDashDemands() {
  return useQuery({
    queryKey: ["dash", "demands"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("demands")
        .select("id,title,lifecycle,commercial_outcome,assigned_to,client_id,created_at,clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DemRow[];
    },
  });
}

export function useDashCandidates() {
  return useQuery({
    queryKey: ["dash", "candidates"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("demand_candidates")
        .select("id,demand_id,stage,submitted_by,created_at,qualification_status,final_decision,talent_hub_cvs(full_name),demands(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CandRow[];
    },
  });
}

export function useDashFinancials(roles: readonly string[]) {
  const allowed = can(roles, "financials.view");
  return useQuery({
    queryKey: ["dash", "financials"],
    enabled: allowed,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("candidate_financials")
        .select("demand_candidate_id,client_rate,candidate_rate,tjm_status,amendment_pending,placement_date,contract_duration_months");
      if (error) throw error;
      return data as Fin[];
    },
  });
}

export type ActivityRow = { id: string; kind: string; body: string | null; created_at: string; author_id: string | null; demand_id: string | null; metadata: Record<string, unknown> | null };
export function useDashActivity(kinds?: string[], authorId?: string) {
  return useQuery({
    queryKey: ["dash", "activity", kinds?.join(",") ?? "all", authorId ?? ""],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase.from("activity_log").select("id,kind,body,created_at,author_id,demand_id,metadata").order("created_at", { ascending: false }).limit(8);
      if (kinds) q = q.in("kind", kinds);
      if (authorId) q = q.eq("author_id", authorId);
      const { data, error } = await q;
      if (error) throw error;
      return data as ActivityRow[];
    },
  });
}
