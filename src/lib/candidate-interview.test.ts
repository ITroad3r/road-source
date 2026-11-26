import { describe, it, expect } from "vitest";
import { can } from "./permissions";
import { interviewSchema, localDayBounds } from "./candidate-interview";

describe("Client interviews", () => {
  it("Sourcer can schedule interviews", () => expect(can(["sourceur"], "interviews.manage")).toBe(true));
  it("HRBP can schedule interviews", () => expect(can(["hrbp"], "interviews.manage")).toBe(true));
  it("Operations sees interviews but cannot change them", () => {
    expect(can(["operations"], "interviews.view")).toBe(true);
    expect(can(["operations"], "interviews.manage")).toBe(false);
  });
  it("Today's interviews are visible to Sourcer and HRBP", () => {
    expect(can(["sourceur"], "interviews.view")).toBe(true);
    expect(can(["hrbp"], "interviews.view")).toBe(true);
  });
  it("Admin-only, CEO and unresolved roles have no new interview access", () => {
    for (const roles of [["admin"], ["ceo"], [], undefined]) {
      expect(can(roles, "interviews.manage")).toBe(false);
      expect(can(roles, "interviews.view")).toBe(false);
    }
  });
  const valid = { starts_at: "2026-11-27T10:30:00.000Z", timezone: "Europe/Paris", mode: "online", location: "", meeting_url: "https://meet.example.com/client", notes: "" };
  it("Supports both onsite and online/visio", () => {
    expect(interviewSchema.safeParse(valid).success).toBe(true);
    expect(interviewSchema.safeParse({ ...valid, mode: "onsite", meeting_url: "", location: "Client office" }).success).toBe(true);
    expect(interviewSchema.safeParse({ ...valid, mode: "phone" }).success).toBe(false);
  });
  it("Requires a valid interview date and time", () => {
    expect(interviewSchema.safeParse({ ...valid, starts_at: "" }).success).toBe(false);
    expect(interviewSchema.safeParse({ ...valid, starts_at: "invalid" }).success).toBe(false);
  });
  it("Rejects unsafe meeting links", () => expect(interviewSchema.safeParse({ ...valid, meeting_url: "javascript:alert(1)" }).success).toBe(false));
  it("Filters the complete local day, including after midnight but excluding the next day", () => {
    const now = new Date(2026, 10, 27, 12, 30);
    const { start, end } = localDayBounds(now);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(start).getDate()).toBe(27);
    expect(new Date(end).getDate()).toBe(28);
    const inDay = (date: Date) => date.toISOString() >= start && date.toISOString() < end;
    expect(inDay(new Date(2026, 10, 27, 0, 0))).toBe(true);
    expect(inDay(new Date(2026, 10, 27, 23, 59))).toBe(true);
    expect(inDay(new Date(2026, 10, 28, 0, 0))).toBe(false);
  });
});