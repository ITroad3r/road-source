import { useMemo, useState } from "react";
import { ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, Legend, ComposedChart, Line } from "recharts";
import { Users, UserPlus, UserMinus, TrendingUp, Euro, Percent, PiggyBank, Activity } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard, Panel } from "@/components/dashboards/shared";
import { useTx } from "@/hooks/use-tx";
import { monthlySeries, summarize, monthlyFigures, isActiveOn, type ResourceLike } from "@/lib/active-resources";

type Row = ResourceLike & { id: string; clientName: string };

function defaultRange() {
  const d = new Date();
  const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const f = new Date(d.getFullYear(), d.getMonth() - 11, 1);
  return { from: `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`, to };
}

/** CEO-only analytics board: headcount flow and recurring monthly money. */
export function ResourceAnalytics({ rows }: { rows: Row[] }) {
  const { tx, locale } = useTx();
  const [range, setRange] = useState(defaultRange);
  const today = new Date().toISOString().slice(0, 10);
  const from = range.from <= range.to ? range.from : range.to;
  const to = range.from <= range.to ? range.to : range.from;
  const series = useMemo(() => monthlySeries(rows, from, to), [rows, from, to]);
  const s = useMemo(() => summarize(series, rows, today), [series, rows, today]);
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const monthLabel = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleDateString(locale, { month: "short", year: "2-digit" });
  const chart = series.map((p) => ({ ...p, label: monthLabel(p.month), leftNeg: -p.left }));
  const byClient = useMemo(() => {
    const m = new Map<string, { client: string; people: number; profit: number }>();
    for (const r of rows) {
      if (!isActiveOn(r, today)) continue;
      const e = m.get(r.client_id) ?? { client: r.clientName, people: 0, profit: 0 };
      e.people += 1; e.profit += monthlyFigures(r.fin).profit; m.set(r.client_id, e);
    }
    return [...m.values()].sort((a, b) => b.profit - a.profit);
  }, [rows, today]);

  return (
    <section className="space-y-4" aria-label={tx("Analytics", "Analyses")}>
      <div className="flex flex-wrap items-end gap-3">
        <div><Label htmlFor="ar-from" className="text-xs">{tx("From", "Du")}</Label><Input id="ar-from" type="month" value={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} className="w-40" /></div>
        <div><Label htmlFor="ar-to" className="text-xs">{tx("To", "Au")}</Label><Input id="ar-to" type="month" value={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} className="w-40" /></div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={tx("Active today", "Actifs aujourd'hui")} value={s.activeNow} icon={Users} />
        <StatCard label={tx("Joined in period", "Entrées sur la période")} value={s.joined} icon={UserPlus} accent="success" />
        <StatCard label={tx("Left in period", "Sorties sur la période")} value={s.left} icon={UserMinus} accent="danger" hint={tx(`Turnover ${(s.churnRate * 100).toFixed(1)}%`, `Turnover ${(s.churnRate * 100).toFixed(1)} %`)} />
        <StatCard label={tx("Net change", "Variation nette")} value={s.net > 0 ? `+${s.net}` : s.net} icon={Activity} />
        <StatCard label={tx("Monthly revenue (now)", "CA mensuel (actuel)")} value={money(s.monthlyRevenueNow)} icon={Euro} />
        <StatCard label={tx("Monthly profit (now)", "Marge mensuelle (actuelle)")} value={money(s.monthlyProfitNow)} icon={TrendingUp} accent="success" hint={tx(`Monthly cost ${money(s.monthlyCostNow)}`, `Coût mensuel ${money(s.monthlyCostNow)}`)} />
        <StatCard label={tx("Margin rate", "Taux de marge")} value={`${(s.marginNow * 100).toFixed(1)}%`} icon={Percent} />
        <StatCard label={tx("Profit in period", "Marge sur la période")} value={money(s.periodProfit)} icon={PiggyBank} accent="success" hint={tx(`Revenue ${money(s.periodRevenue)}`, `CA ${money(s.periodRevenue)}`)} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={tx("Incoming vs outgoing resources", "Ressources entrantes vs sortantes")} icon={Users}>
          <div className="h-64 p-3"><ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" fontSize={11} stroke="var(--muted-foreground)" /><YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
              <Tooltip formatter={(v: number) => Math.abs(v)} /><Legend />
              <Bar dataKey="joined" name={tx("Joined", "Entrées")} fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="leftNeg" name={tx("Left", "Sorties")} fill="var(--destructive)" radius={[0, 0, 4, 4]} />
              <Line type="monotone" dataKey="active" name={tx("Active", "Actifs")} stroke="var(--primary)" strokeWidth={2} />
            </ComposedChart></ResponsiveContainer></div>
        </Panel>
        <Panel title={tx("Monthly revenue, cost and profit", "CA, coût et marge mensuels")} icon={Euro}>
          <div className="h-64 p-3"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" fontSize={11} stroke="var(--muted-foreground)" /><YAxis fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => money(v)} /><Legend />
              <Bar dataKey="revenue" name={tx("Revenue", "CA")} fill="var(--chart-1)" />
              <Bar dataKey="cost" name={tx("Cost", "Coût")} fill="var(--chart-4)" />
              <Bar dataKey="profit" name={tx("Profit", "Marge")} fill="var(--chart-2)" />
            </BarChart></ResponsiveContainer></div>
        </Panel>
      </div>
      <Panel title={tx("Active resources and monthly profit by client", "Ressources actives et marge mensuelle par client")} icon={TrendingUp} empty={byClient.length === 0}>
        <div className="p-3" style={{ height: Math.max(160, byClient.length * 36 + 40) }}><ResponsiveContainer width="100%" height="100%">
          <BarChart data={byClient} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <YAxis type="category" dataKey="client" width={140} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip formatter={(v: number, n: string) => (n === "people" ? v : money(v))} />
            <Bar dataKey="profit" name={tx("Monthly profit", "Marge mensuelle")} fill="var(--primary)" radius={[0, 4, 4, 0]} />
          </BarChart></ResponsiveContainer></div>
      </Panel>
    </section>
  );
}
