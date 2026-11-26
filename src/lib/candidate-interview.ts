import { z } from "zod";

export const interviewSchema = z.object({
  starts_at: z.string().datetime(),
  timezone: z.string().min(1).max(100).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }),
  mode: z.enum(["onsite", "online"]),
  location: z.string().trim().max(1000),
  meeting_url: z.string().trim().max(2000).refine(value => !value || /^https?:\/\//i.test(value) && z.string().url().safeParse(value).success),
  notes: z.string().trim().max(4000),
});

export function localDayBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}