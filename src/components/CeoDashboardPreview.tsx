import {
  TrendingUp,
  TrendingDown,
  Users,
  Briefcase,
  Target,
  DollarSign,
  MoreVertical,
} from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Static, material-design styled preview of the CEO analytics dashboard.
 * Used on the landing page hero to showcase the product.
 */
export function CeoDashboardPreview() {
  const { t } = useTranslation();
  return (
    <div className="relative">
      {/* Ambient glow */}
      <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-primary/15 via-accent/10 to-transparent blur-3xl -z-10" />

      <div className="rounded-2xl bg-card border border-border/60 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.18)] overflow-hidden">
        {/* App bar (Material) */}
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center font-bold text-xs">
              CEO
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-foreground">
                {t("ceoPreview.title")}
              </div>
              <div className="text-[10px] text-muted-foreground">{t("ceoPreview.subtitle")}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-muted-foreground">{t("ceoPreview.synced")}</span>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3 p-4 bg-muted/30">
          <KpiTile
            icon={Briefcase}
            label={t("ceoPreview.openDemands")}
            value="24"
            delta="+12%"
            trend="up"
            tone="primary"
          />
          <KpiTile
            icon={Users}
            label={t("ceoPreview.activeCandidates")}
            value="137"
            delta="+8%"
            trend="up"
            tone="accent"
          />
          <KpiTile
            icon={Target}
            label={t("ceoPreview.placementRate")}
            value="42%"
            delta="+3.1pt"
            trend="up"
            tone="primary"
          />
          <KpiTile
            icon={DollarSign}
            label={t("ceoPreview.pipelineValue")}
            value="€1.8M"
            delta="−2%"
            trend="down"
            tone="accent"
          />
        </div>

        {/* Revenue chart card */}
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-border/70 bg-background p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t("ceoPreview.revenueVsTarget")}
                </div>
                <div className="text-lg font-bold tracking-tight">€420K</div>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <TrendingUp className="h-3 w-3" />
                +18.4%
              </div>
            </div>
            <BarChart />
            <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
              <span>{t("ceoPreview.jan")}</span>
              <span>{t("ceoPreview.feb")}</span>
              <span>{t("ceoPreview.mar")}</span>
              <span>{t("ceoPreview.apr")}</span>
              <span>{t("ceoPreview.may")}</span>
              <span>{t("ceoPreview.jun")}</span>
            </div>
          </div>
        </div>

        {/* Pipeline funnel */}
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-border/70 bg-background p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t("ceoPreview.pipelineFunnel")}
              </div>
              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <FunnelRow label={t("ceoPreview.identified")} value={284} pct={100} tone="primary" />
              <FunnelRow label={t("ceoPreview.submitted")} value={168} pct={59} tone="primary" />
              <FunnelRow label={t("ceoPreview.interview")} value={92} pct={32} tone="accent" />
              <FunnelRow label={t("ceoPreview.offer")} value={41} pct={14} tone="accent" />
              <FunnelRow label={t("ceoPreview.placed")} value={27} pct={9} tone="emerald" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  delta,
  trend,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  tone: "primary" | "accent";
}) {
  const toneBg = tone === "primary" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent";
  const TrendIcon = trend === "up" ? TrendingUp : TrendingDown;
  const trendColor = trend === "up" ? "text-emerald-600" : "text-rose-600";
  return (
    <div className="rounded-xl bg-background border border-border/70 p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${toneBg}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          {delta}
        </div>
      </div>
      <div className="mt-2 text-xl font-extrabold tracking-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
    </div>
  );
}

function BarChart() {
  const data = [
    { actual: 55, target: 70 },
    { actual: 68, target: 72 },
    { actual: 74, target: 75 },
    { actual: 82, target: 78 },
    { actual: 90, target: 82 },
    { actual: 96, target: 85 },
  ];
  const max = 100;
  return (
    <div className="h-24 flex items-end justify-between gap-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex items-end justify-center gap-1 h-full">
          <div
            className="w-2.5 rounded-t-sm bg-muted-foreground/25"
            style={{ height: `${(d.target / max) * 100}%` }}
          />
          <div
            className="w-2.5 rounded-t-sm bg-gradient-to-t from-primary to-primary/70 shadow-sm"
            style={{ height: `${(d.actual / max) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function FunnelRow({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: number;
  pct: number;
  tone: "primary" | "accent" | "emerald";
}) {
  const bar =
    tone === "primary"
      ? "bg-gradient-to-r from-primary to-primary/70"
      : tone === "accent"
        ? "bg-gradient-to-r from-accent to-accent/70"
        : "bg-gradient-to-r from-emerald-500 to-emerald-400";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
