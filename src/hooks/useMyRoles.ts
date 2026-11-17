import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APP_ROLES, type AppRole } from "@/lib/permissions";

export type { AppRole };
export { can } from "@/lib/permissions";

export const ROLE_LABEL: Record<AppRole, string> = {
  sourceur: "Sourceur",
  hrbp: "HRBP",
  operations: "Direction des Opérations",
  ceo: "CEO",
  admin: "Admin",
};

export function useMyRoles(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as string).filter((r): r is AppRole => (APP_ROLES as readonly string[]).includes(r));
    },
  });
}
