import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Wallet, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { compQueueCounts, type CompQueueRow, type CompStatus } from "@/lib/compensation";

/** Pending compensation work for one role workspace (RLS scopes the rows). */
export function CompensationQueueCard({ queue, userId }: { queue: "sourceur" | "hrbp" | "operations"; userId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["dash", "compensation"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("demand_candidates")
        .select("requires_compensation, demands(assigned_to), compensation_proposals(status)");
      if (error) throw error;
      type R = { requires_compensation: boolean; demands: { assigned_to: string | null } | null; compensation_proposals: { status: CompStatus } | { status: CompStatus }[] | null };
      return ((data ?? []) as unknown as R[]).map<CompQueueRow>((r) => {
        const p = Array.isArray(r.compensation_proposals) ? r.compensation_proposals[0] : r.compensation_proposals;
        return { requires_compensation: r.requires_compensation, assigned_to: r.demands?.assigned_to ?? null, status: p?.status ?? null };
      });
    },
  });
  const c = q.data ? compQueueCounts(q.data, userId) : null;
  const main = c ? c[queue] : null;
  const sub = c ? (queue === "sourceur" ? c.returnedToSourceur : queue === "hrbp" ? c.returnedToManager : c.approved) : null;
  const subLabel = queue === "operations" ? t("comp.status.approved") : t(queue === "sourceur" ? "comp.status.returned_to_sourceur" : "comp.status.returned_to_manager");
  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Wallet className="h-5 w-5 text-primary" /></div>
          <div>
            <div className="text-sm text-muted-foreground">{t("comp.kpiPending")} — {t(`comp.queues.${queue}`)}</div>
            {q.isLoading ? <div className="text-2xl font-bold">…</div>
              : q.error ? <div role="alert" className="text-sm text-destructive">{t("comp.loadError")}</div>
              : <div className="text-2xl font-bold" data-testid={`comp-count-${queue}`}>{main}<span className="ml-3 text-xs font-normal text-muted-foreground">{subLabel}: {sub}</span></div>}
          </div>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/compensation">{t("comp.manage")}<ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
      </CardContent>
    </Card>
  );
}
