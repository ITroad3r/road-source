// Active Resources: placed people at clients and the CEO analytics computed from them.
export const WORKING_DAYS_PER_MONTH = 20;

export type PayType = "monthly" | "daily";
export type ResourceFinancials = { pay_type: PayType; cost_amount: number | null; sell_amount: number | null; currency: string };
export type ResourceLike = { client_id: string; start_date: string; end_date: string | null; fin?: ResourceFinancials | null };

/** Converts a pay amount to its monthly equivalent (daily rate × 20 working days). */
export function toMonthly(amount: number | null | undefined, payType: PayType): number {
  if (amount == null || !Number.isFinite(amount)) return 0;
  return payType === "daily" ? amount * WORKING_DAYS_PER_MONTH : amount;
}

export function monthlyFigures(fin: ResourceFinancials | null | undefined) {
  if (!fin) return { cost: 0, sell: 0, profit: 0 };
  const cost = toMonthly(fin.cost_amount, fin.pay_type);
  const sell = toMonthly(fin.sell_amount, fin.pay_type);
  return { cost, sell, profit: sell - cost };
}

/** Active on a given ISO day: started on/before it and not yet left. */
export function isActiveOn(r: Pick<ResourceLike, "start_date" | "end_date">, day: string): boolean {
  return r.start_date <= day && (r.end_date == null || r.end_date >= day);
}

const pad = (n: number) => String(n).padStart(2, "0");
export const monthKey = (iso: string) => iso.slice(0, 7);

/** Inclusive list of "YYYY-MM" keys between two months. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
    if (out.length > 120) break;
  }
  return out;
}

function monthBounds(key: string) {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${key}-01`, end: `${key}-${pad(last)}` };
}

export type MonthPoint = { month: string; active: number; joined: number; left: number; revenue: number; cost: number; profit: number };

/** Per month: people active at any point, joiners, leavers and the monthly revenue/cost/profit they generate. */
export function monthlySeries(rows: readonly ResourceLike[], fromMonth: string, toMonth: string): MonthPoint[] {
  return monthRange(fromMonth, toMonth).map((month) => {
    const { start, end } = monthBounds(month);
    const p: MonthPoint = { month, active: 0, joined: 0, left: 0, revenue: 0, cost: 0, profit: 0 };
    for (const r of rows) {
      if (monthKey(r.start_date) === month) p.joined += 1;
      if (r.end_date && monthKey(r.end_date) === month) p.left += 1;
      if (r.start_date <= end && (r.end_date == null || r.end_date >= start)) {
        p.active += 1;
        const f = monthlyFigures(r.fin);
        p.revenue += f.sell; p.cost += f.cost; p.profit += f.profit;
      }
    }
    return p;
  });
}

export function summarize(series: readonly MonthPoint[], rows: readonly ResourceLike[], today: string) {
  const activeNow = rows.filter((r) => isActiveOn(r, today));
  const now = activeNow.reduce((a, r) => { const f = monthlyFigures(r.fin); return { revenue: a.revenue + f.sell, cost: a.cost + f.cost, profit: a.profit + f.profit }; }, { revenue: 0, cost: 0, profit: 0 });
  const joined = series.reduce((s, p) => s + p.joined, 0);
  const left = series.reduce((s, p) => s + p.left, 0);
  const revenue = series.reduce((s, p) => s + p.revenue, 0);
  const profit = series.reduce((s, p) => s + p.profit, 0);
  const startActive = series[0]?.active ?? 0;
  return {
    activeNow: activeNow.length, joined, left, net: joined - left,
    churnRate: startActive + joined > 0 ? left / (startActive + joined) : 0,
    monthlyRevenueNow: now.revenue, monthlyCostNow: now.cost, monthlyProfitNow: now.profit,
    marginNow: now.revenue > 0 ? now.profit / now.revenue : 0,
    periodRevenue: revenue, periodProfit: profit,
  };
}
