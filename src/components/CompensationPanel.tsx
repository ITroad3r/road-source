import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Wallet, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  CONTRACT_TYPES, COMMENT_REQUIRED, allowedActions, currentValues, frequencyFor, parseAmount, validateProposal,
  type CompAction, type CompStatus, type ContractType, type ProposalLike,
} from "@/lib/compensation";

export type ProposalSummary = ProposalLike & { id: string; version: number; currency: string };

export const COMP_STATUS_COLORS: Record<CompStatus | "none", string> = {
  none: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  pending_manager_review: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  returned_to_sourceur: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  reviewed_by_manager: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  pending_operations_review: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  returned_to_manager: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
};

export function useMoney() {
  const { t, i18n } = useTranslation();
  return (amount: number | null | undefined, type: ContractType | null | undefined, currency = "EUR") => {
    if (amount == null) return "—";
    const v = new Intl.NumberFormat(i18n.language?.startsWith("fr") ? "fr-FR" : "en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount));
    const f = frequencyFor(type);
    return f ? `${v} ${t(f === "daily" ? "comp.perDay" : "comp.perMonth")}` : v;
  };
}

export function CompStatusBadge({ status }: { status: CompStatus | null }) {
  const { t } = useTranslation();
  const s = status ?? "none";
  return <Badge variant="outline" className={`text-[10px] ${COMP_STATUS_COLORS[s]}`}>{t(`comp.status.${s}`)}</Badge>;
}

/** Compact summary used in pipelines and queues; opens the full workflow dialog. */
export function CompensationSummary({ dcId, candidateName, proposal, roles, isAssignedSourceur, compact, onOpen }: {
  dcId: string; candidateName: string; proposal: ProposalSummary | null; roles: string[] | undefined; isAssignedSourceur: boolean; compact?: boolean;
  /** When set, the parent owns the dialog (keeps it open if the row moves to another queue). */
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const money = useMoney();
  const [open, setOpen] = useState(false);
  const cur = currentValues(proposal);
  return (
    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1">
        <CompStatusBadge status={proposal?.status ?? null} />
        {cur.type && <Badge variant="secondary" className="text-[10px]">{t(`comp.types.${cur.type}`)}</Badge>}
        {cur.amount != null && <span className="text-[11px] text-muted-foreground">{money(cur.amount, cur.type, proposal?.currency)}</span>}
      </div>
      <Button size="sm" variant="outline" className={compact ? "h-6 px-2 text-[11px]" : "h-7 px-2 text-xs"} onClick={() => (onOpen ? onOpen() : setOpen(true))}>
        <Wallet className="h-3 w-3 mr-1" />{t("comp.manage")}
      </Button>
      {open && <CompensationDialog open={open} onOpenChange={setOpen} dcId={dcId} candidateName={candidateName} roles={roles} isAssignedSourceur={isAssignedSourceur} />}
    </div>
  );
}

type FullProposal = ProposalSummary & {
  original_contract_type: ContractType | null; original_amount: number | null; original_submitted_at: string | null; original_submitted_by: string | null;
  manager_comment: string | null; manager_at: string | null; manager_by: string | null;
  operations_comment: string | null; final_at: string | null; final_by: string | null; last_return_reason: string | null;
};
type AuditRow = { id: number; actor_id: string; actor_role: string; action: string; from_status: CompStatus | null; to_status: CompStatus;
  old_contract_type: ContractType | null; new_contract_type: ContractType | null; old_amount: number | null; new_amount: number | null;
  currency: string; comment: string | null; created_at: string };

export function CompensationDialog({ open, onOpenChange, dcId, candidateName, roles, isAssignedSourceur }: {
  open: boolean; onOpenChange: (o: boolean) => void; dcId: string; candidateName: string; roles: string[] | undefined; isAssignedSourceur: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const money = useMoney();
  const key = ["compensation", dcId];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key, enabled: open,
    queryFn: async () => {
      const [p, a] = await Promise.all([
        supabase.from("compensation_proposals").select("*").eq("demand_candidate_id", dcId).maybeSingle(),
        supabase.from("compensation_audit").select("*").eq("demand_candidate_id", dcId).order("id", { ascending: true }),
      ]);
      if (p.error) throw p.error; if (a.error) throw a.error;
      return { proposal: p.data as FullProposal | null, audit: (a.data ?? []) as AuditRow[] };
    },
  });
  const { data: team } = useQuery({
    queryKey: ["team-members"], enabled: open,
    queryFn: async () => { const { data } = await supabase.rpc("list_team_members"); return new Map((data ?? []).map((m) => [m.id, m.full_name])); },
  });
  const p = data?.proposal ?? null;
  const cur = currentValues(p);
  const [type, setType] = useState<ContractType | "">("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [pending, setPending] = useState<CompAction | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    setType(cur.type ?? ""); setAmount(cur.amount != null ? String(cur.amount) : ""); setCurrency(p?.currency ?? "EUR"); setFormErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.version, p?.status]);

  const actions = allowedActions(p?.status ?? null, roles, isAssignedSourceur);
  const editable = actions.some((a) => ["save_draft", "submit", "manager_review", "forward", "approve"].includes(a));
  const freq = frequencyFor(type || null);

  function changeType(v: ContractType) {
    // Never carry a salary into a TJM field (or the reverse): clear the amount when the frequency changes.
    if (frequencyFor(v) !== frequencyFor(type || null)) setAmount("");
    setType(v); setFormErr(null);
  }

  function request(a: CompAction) {
    const forSubmit = a === "submit" || a === "forward" || a === "approve" || a === "manager_review";
    if (["save_draft", "submit", "manager_review", "forward", "approve"].includes(a)) {
      const err = validateProposal(type || null, amount, forSubmit);
      if (err) { setFormErr(t(`comp.errors.${err}`)); return; }
    }
    setComment(""); setPending(a);
  }

  async function run() {
    if (!pending) return;
    if (COMMENT_REQUIRED.includes(pending) && !comment.trim()) { toast.error(t("comp.confirm.commentRequired")); return; }
    setBusy(true);
    const withValues = ["save_draft", "submit", "manager_review", "forward", "approve"].includes(pending);
    const amt = parseAmount(amount);
    const changed = withValues && (type !== (cur.type ?? "") || amt !== (cur.amount != null ? Number(cur.amount) : null) || currency !== (p?.currency ?? "EUR"));
    const args: {
      _demand_candidate_id: string; _action: string; _expected_version?: number;
      _contract_type?: ContractType; _amount?: number; _currency?: string; _comment?: string;
    } = { _demand_candidate_id: dcId, _action: pending };
    if (p) args._expected_version = p.version;
    if (withValues && (changed || !p)) {
      if (type) args._contract_type = type;
      if (amt != null) args._amount = amt;
      args._currency = currency;
    }
    if (comment.trim()) args._comment = comment.trim();
    const { error: e } = await supabase.rpc("compensation_action", args);
    setBusy(false); setPending(null);
    if (e) {
      if (e.code === "40001" || /Stale update/.test(e.message)) { toast.error(t("comp.errors.stale")); await refetch(); return; }
      toast.error(e.message); return;
    }
    toast.success(t("comp.saved"));
    await qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["compensation-list"] });
    qc.invalidateQueries({ queryKey: ["demand-candidates"] });
  }

  const who = (id: string | null | undefined) => (id && team?.get(id)) || "—";
  const when = (d: string | null | undefined) => (d ? format(new Date(d), "dd/MM/yyyy HH:mm") : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">{t("comp.title")} — {candidateName} <CompStatusBadge status={p?.status ?? null} /></DialogTitle>
          <DialogDescription>{t("comp.intro")}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />{t("comp.loading")}</div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">{t("comp.loadError")}</p>
        ) : (
          <div className="space-y-5">
            {p && (
              <div className="grid gap-3 sm:grid-cols-3">
                <ValueCard label={t("comp.original")} type={p.original_contract_type} amount={p.original_amount} currency={p.currency} meta={p.original_submitted_at ? `${who(p.original_submitted_by)} · ${when(p.original_submitted_at)}` : ""} money={money} />
                <ValueCard label={t("comp.amended")} type={p.manager_contract_type} amount={p.manager_amount} currency={p.currency} meta={p.manager_at ? `${who(p.manager_by)} · ${when(p.manager_at)}` : ""} money={money}
                  changed={!!p.manager_contract_type && (p.manager_contract_type !== p.proposed_contract_type || Number(p.manager_amount) !== Number(p.proposed_amount))} />
                <ValueCard label={t("comp.final")} type={p.final_contract_type} amount={p.final_amount} currency={p.currency} meta={p.status === "approved" && p.final_at ? `${who(p.final_by)} · ${when(p.final_at)}` : ""} money={money} highlight={p.status === "approved"} />
              </div>
            )}
            {p?.last_return_reason && ["returned_to_sourceur", "returned_to_manager"].includes(p.status) && (
              <p className="text-sm rounded-md border border-orange-500/30 bg-orange-500/5 p-3"><span className="font-medium">{t("comp.returnReason")}: </span>{p.last_return_reason}</p>
            )}
            {p?.manager_comment && <p className="text-sm"><span className="font-medium">{t("comp.managerComment")}: </span>{p.manager_comment}</p>}
            {p?.operations_comment && <p className="text-sm"><span className="font-medium">{t("comp.opsComment")}: </span>{p.operations_comment}</p>}

            {editable ? (
              <fieldset className="space-y-3 rounded-lg border p-4">
                <legend className="px-1 text-sm font-semibold">{t("comp.section")}</legend>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_110px]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`ct-${dcId}`}>{t("comp.contractType")} *</Label>
                    <Select value={type} onValueChange={(v) => changeType(v as ContractType)}>
                      <SelectTrigger id={`ct-${dcId}`} aria-required><SelectValue placeholder={t("comp.selectType")} /></SelectTrigger>
                      <SelectContent>{CONTRACT_TYPES.map((c) => <SelectItem key={c} value={c}>{t(`comp.types.${c}`)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {freq && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`amt-${dcId}`}>{t(freq === "daily" ? "comp.dailyRate" : "comp.monthlySalary")} *</Label>
                      <Input id={`amt-${dcId}`} inputMode="decimal" type="number" min={1} step="0.01" value={amount} aria-invalid={!!formErr}
                        onChange={(e) => { setAmount(e.target.value); setFormErr(null); }} />
                    </div>
                  )}
                  {freq && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`cur-${dcId}`}>{t("comp.currency")}</Label>
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger id={`cur-${dcId}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{["EUR", "MAD", "USD", "GBP", "CHF"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {formErr && <p role="alert" className="text-sm text-destructive">{formErr}</p>}
              </fieldset>
            ) : (
              <p className="text-xs text-muted-foreground">{t("comp.readOnly")}</p>
            )}

            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {actions.map((a) => (
                  <Button key={a} size="sm" variant={["submit", "forward", "approve"].includes(a) ? "default" : ["reject"].includes(a) ? "destructive" : "outline"} onClick={() => request(a)} disabled={busy}>
                    {t(`comp.actions.${a}`)}
                  </Button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><History className="h-4 w-4" />{t("comp.history")}</h3>
              {(data?.audit ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("comp.noHistory")}</p> : (
                <ol className="space-y-2 border-l pl-4">
                  {(data?.audit ?? []).map((e) => (
                    <li key={e.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{t(`comp.actions.${e.action}`, e.action)}</span>
                        <span className="text-xs text-muted-foreground">{t("comp.by")} {who(e.actor_id)} ({t(`roles.${e.actor_role}`, e.actor_role)}) · {when(e.created_at)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.from_status ? t(`comp.status.${e.from_status}`) : t("comp.status.none")} → {t(`comp.status.${e.to_status}`)}
                        {(e.old_contract_type !== e.new_contract_type || Number(e.old_amount) !== Number(e.new_amount)) && e.new_amount != null && (
                          <> · {e.old_contract_type ? `${t(`comp.types.${e.old_contract_type}`)} ${money(e.old_amount, e.old_contract_type, e.currency)}` : "—"} → {e.new_contract_type ? t(`comp.types.${e.new_contract_type}`) : ""} {money(e.new_amount, e.new_contract_type, e.currency)}</>
                        )}
                      </div>
                      {e.comment && <p className="text-xs mt-0.5">“{e.comment}”</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}

        <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("comp.confirm.title", { action: pending ? t(`comp.actions.${pending}`) : "" })}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("comp.confirm.body")}
                {pending && ["save_draft", "submit", "manager_review", "forward", "approve"].includes(pending) && type && (
                  <span className="block mt-2 font-medium text-foreground">{t(`comp.types.${type}`)} · {money(parseAmount(amount), type, currency)}</span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor={`cm-${dcId}`}>{t("comp.confirm.comment")}{pending && COMMENT_REQUIRED.includes(pending) ? " *" : ""}</Label>
              <Textarea id={`cm-${dcId}`} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{t("common.cancel", "Cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); void run(); }} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t("comp.confirm.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function ValueCard({ label, type, amount, currency, meta, money, changed, highlight }: {
  label: string; type: ContractType | null; amount: number | null; currency: string; meta: string;
  money: ReturnType<typeof useMoney>; changed?: boolean; highlight?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-emerald-500/40 bg-emerald-500/5" : changed ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-sm mt-1">{type ? t(`comp.types.${type}`) : "—"}</div>
      <div className="text-sm">{money(amount, type, currency)}</div>
      {meta && <div className="text-[11px] text-muted-foreground mt-1">{meta}</div>}
    </div>
  );
}
