import { describe, expect, it } from "vitest";
import { chatRoomsFor, chatMessageSchema } from "./candidate-chat";

describe("Private candidate chats", () => {
  it("HRBP communicates with Sourcers in both directions", () => {
    expect(chatRoomsFor(["hrbp"], false)).toContain("sourcing");
    expect(chatRoomsFor(["sourceur"], true)).toEqual(["sourcing"]);
  });
  it("HRBP communicates with Operations in both directions", () => {
    expect(chatRoomsFor(["hrbp"], false)).toContain("operations");
    expect(chatRoomsFor(["operations"], false)).toEqual(["operations"]);
  });
  it("Sourcers never see the Operations conversation", () => {
    expect(chatRoomsFor(["sourceur"], true)).not.toContain("operations");
  });
  it("Operations never sees the Sourcer conversation", () => {
    expect(chatRoomsFor(["operations"], true)).not.toContain("sourcing");
  });
  it("unassigned Sourcers cannot use a candidate chat", () => {
    expect(chatRoomsFor(["sourceur"], false)).toEqual([]);
    expect(chatRoomsFor(["sourceur", "operations"], false)).toEqual(["operations"]);
  });
  it("CEO, Admin-only and unresolved users cannot access either conversation", () => {
    for (const roles of [["ceo"], ["admin"], [], ["unknown"], undefined]) expect(chatRoomsFor(roles, true)).toEqual([]);
  });
  it("rejects empty or oversized messages", () => {
    expect(chatMessageSchema.safeParse("  ").success).toBe(false);
    expect(chatMessageSchema.safeParse("x".repeat(5001)).success).toBe(false);
    expect(chatMessageSchema.parse(" Review the candidate ")).toBe("Review the candidate");
  });
});