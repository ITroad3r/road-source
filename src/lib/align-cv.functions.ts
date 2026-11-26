import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { alignCvInputSchema } from "./align-cv";
import { can } from "./permissions";

export const alignCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(alignCvInputSchema)
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).limit(20);
    if (error || !can(roles?.map((row) => row.role), "cv.align")) throw new Error("Forbidden");
    const { generateAlignedCv } = await import("./align-cv.server");
    return generateAlignedCv(data);
  });