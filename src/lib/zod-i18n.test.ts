import { describe, expect, it } from "vitest";
import { z } from "zod";
import i18n from "@/i18n";

describe("validation messages follow the current language", () => {
  it("switches language without reloading", async () => {
    const s = z.object({ name: z.string().min(2), email: z.string().email() });
    await i18n.changeLanguage("en");
    expect(s.safeParse({ name: "a", email: "x" }).error?.issues.map((i) => i.message)).toEqual(["Must be at least 2 characters", "Invalid email address"]);
    await i18n.changeLanguage("fr");
    expect(s.safeParse({ name: "a", email: "x" }).error?.issues.map((i) => i.message)).toEqual(["Au moins 2 caractères requis", "Adresse e-mail invalide"]);
  });
});
