import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Interview = Database["public"]["Tables"]["candidate_interviews"]["Row"];
export function useCandidateInterviews(dcId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["candidate-interviews", dcId], enabled, staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("candidate_interviews").select("*")
        .eq("demand_candidate_id", dcId).order("starts_at");
      if (error) throw error;
      return data;
    },
  });
}