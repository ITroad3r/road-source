import { txNow } from "@/hooks/use-tx";
export const LIFECYCLE_VALUES = ["open", "in_progress", "on_hold", "filled", "cancelled"] as const;
export type Lifecycle = (typeof LIFECYCLE_VALUES)[number];

export const OUTCOME_VALUES = ["pending", "won", "lost"] as const;
export type Outcome = (typeof OUTCOME_VALUES)[number];

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  get open() { return txNow("Open", "Ouverte"); },
  get in_progress() { return txNow("In progress", "En cours"); },
  get on_hold() { return txNow("On hold", "En pause"); },
  get filled() { return txNow("Filled", "Pourvue"); },
  get cancelled() { return txNow("Cancelled", "Annulée"); },
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  get pending() { return txNow("Pending", "En attente"); },
  get won() { return txNow("Won", "Gagnée"); },
  get lost() { return txNow("Lost", "Perdue"); },
};

export const LIFECYCLE_COLORS: Record<Lifecycle, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  in_progress: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  on_hold: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  filled: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export const OUTCOME_COLORS: Record<Outcome, string> = {
  pending: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  won: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  lost: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
};
