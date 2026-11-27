import { describe, expect, it } from "vitest";
import { monthlyFigures, monthlySeries, summarize, isActiveOn } from "./active-resources";

const sold = (sell: number, cost: number, pay_type: "monthly" | "daily" = "monthly") => ({ pay_type, cost_amount: cost, sell_amount: sell, currency: "EUR" });

describe("active resources", () => {
  it("profit repeats every active month: pay 100, sell 200 → 100 per month", () => {
    const rows = [{ client_id: "c", start_date: "2026-01-10", end_date: null, fin: sold(200, 100) }];
    const s = monthlySeries(rows, "2026-01", "2026-03");
    expect(s.map((p) => p.profit)).toEqual([100, 100, 100]);
    expect(summarize(s, rows, "2026-03-15").periodProfit).toBe(300);
  });
  it("daily rates count as 20 working days a month", () => {
    expect(monthlyFigures(sold(300, 180, "daily"))).toEqual({ cost: 3600, sell: 6000, profit: 2400 });
  });
  it("leavers stop counting after their end month", () => {
    const rows = [{ client_id: "c", start_date: "2026-01-01", end_date: "2026-02-10", fin: sold(200, 100) }];
    const s = monthlySeries(rows, "2026-01", "2026-03");
    expect(s.map((p) => [p.active, p.left])).toEqual([[1, 0], [1, 1], [0, 0]]);
    expect(isActiveOn(rows[0]!, "2026-02-11")).toBe(false);
  });
});
