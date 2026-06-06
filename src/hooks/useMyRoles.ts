import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "sourcing_team" | "division_manager" | "division_director" | "ceo" | "admin";

// Convenience role groups matching the permission matrix
export const MANAGER_PLUS: AppRole[] = ["division_manager", "admin"];
export const DIRECTOR_PLUS: AppRole[] = ["division_director", "admin"];
export const FINANCIAL_VIEW: AppRole[] = ["division_manager", "division_director", "ceo", "admin"];
export const FINANCIAL_WRITE: AppRole[] = ["division_manager", "division_director", "admin"];
export const CV_WRITE: AppRole[] = ["sourcing_team", "division_manager", "division_director", "admin"];

export function hasAny(roles: AppRole[] | undefined, group: AppRole[]) {
  return !!roles?.some((r) => group.includes(r));
}

export const ROLE_LABEL: Record<AppRole, string> = {
  sourcing_team: "Sourcing Team",
  division_manager: "Division Manager",
  division_director: "Division Director",
  ceo: "CEO",
  admin: "Admin",
};

export function useMyRoles(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}
