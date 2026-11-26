import { z } from "zod";
import { can } from "./permissions";

export const CHAT_ROOMS = ["sourcing", "operations"] as const;
export type ChatRoom = (typeof CHAT_ROOMS)[number];
export const chatMessageSchema = z.string().trim().min(1).max(5000);
export function chatRoomsFor(roles: readonly string[] | undefined, assigned: boolean): ChatRoom[] {
  return CHAT_ROOMS.filter(room => can(roles, room === "sourcing" ? "chat.sourcing" : "chat.operations") &&
    (room !== "sourcing" || can(roles, "chat.sourcingAll") || assigned));
}