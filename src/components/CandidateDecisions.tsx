import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { can } from "@/lib/permissions";
import { readyForHrbp } from "@/lib/pipeline-workflow";
import { finalApprovalBlocker, type CompGate, type FinalDecision, type QualificationStatus, type TjmStatus } from "@/lib/decisions";

export type DecisionRow = {
  id: string;
  stage: string;
  qualification_status: QualificationStatus;
  final_decision: FinalDecision;
  tjm_status: TjmStatus | null; // null = no rate row (or not visible to this role)
  comp?: CompGate; // compensation proposal gate (null = legacy candidature)
};

const Q_COLORS: Record<QualificationStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  qualified: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
};
const D_COLORS: Record<FinalDecision, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
};

type Action = { field: "qualification" | "decision"; value: string } | null;

export function CandidateDecisions({ row, roles, onChanged, compact }: { row: DecisionRow; roles: string[] | undefined; onChanged: () => void; compact?: boolean }) {
  const { t } = useTranslation();
  const [action, setAction] = useState<Action>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const canQualify = can(roles, "pipeline.qualify");
  const canDecide = can(roles, "pipeline.finalDecision");
  const blocker = finalApprovalBlocker(row.qualification_status, row.tjm_status, row.comp);

  async function submit() {
    if (!action || (action.field === "qualification" ? !canQualify || !readyForHrbp(row.stage) : !canDecide || !!blocker)) return;
    setBusy(true);
    const patch = action.field === "qualification"
      ? { qualification_status: action.value as QualificationStatus, qualification_notes: notes || null }
      : { final_decision: action.value as FinalDecision, decision_notes: notes || null };
    const { error } = await supabase.from("demand_candidates").update(patch).eq("id", row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("decisions.saved"));
    setAction(null); setNotes(""); onChanged();
  }

  const size = compact ? "h-6 px-2 text-[11px]" : "h-7 px-2 text-xs";
  return (
    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className={`text-[10px] ${Q_COLORS[row.qualification_status]}`}>
          {t(`decisions.q.${row.qualification_status}`)}
        </Badge>
        <Badge variant="outline" className={`text-[10px] ${D_COLORS[row.final_decision]}`}>
          {t(`decisions.d.${row.final_decision}`)}
        </Badge>
      </div>
      {canQualify && readyForHrbp(row.stage) && row.final_decision === "pending" && (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className={size} onClick={() => setAction({ field: "qualification", value: "qualified" })}>{t("decisions.qualify")}</Button>
          <Button size="sm" variant="outline" className={size} onClick={() => setAction({ field: "qualification", value: "rejected" })}>{t("decisions.reject")}</Button>
        </div>
      )}
      {canDecide && row.qualification_status === "qualified" && row.final_decision === "pending" && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" className={size} disabled={!!blocker} onClick={() => setAction({ field: "decision", value: "approved" })}>{t("decisions.approve")}</Button>
            <Button size="sm" variant="outline" className={size} disabled={!!blocker} onClick={() => setAction({ field: "decision", value: "rejected" })}>{t("decisions.rejectFinal")}</Button>
          </div>
          {blocker && <p className="text-[11px] text-muted-foreground">{t(`decisions.blocker.${blocker}`)}</p>}
        </div>
      )}
      {!canQualify && !canDecide && row.final_decision === "pending" && (
        <p className="text-[11px] text-muted-foreground">
          {row.qualification_status === "pending" ? t("decisions.awaitHrbp") : row.qualification_status === "qualified" ? t("decisions.awaitOps") : t("decisions.rejectedByHrbp")}
        </p>
      )}

      <Dialog open={!!action} onOpenChange={(o) => { if (!o) { setAction(null); setNotes(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{action ? t(`decisions.dialog.${action.field}.${action.value}`) : ""}</DialogTitle></DialogHeader>
          <Textarea placeholder={t("decisions.notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button onClick={submit} disabled={busy}>{t("decisions.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
