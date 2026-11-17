import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ROLES = ["sourceur", "hrbp", "operations", "ceo", "admin"] as const;
type Role = (typeof ROLES)[number];

const InviteSchema = z.object({
  email: z.string().email().max(254),
  fullName: z.string().min(1).max(120),
  role: z.enum(ROLES),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const siteUrl = process.env.SITE_URL || "https://road-source.lovable.app";
    const redirectTo = `${siteUrl}/set-password`;

    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName, invited_role: data.role },
      redirectTo,
    });
    if (error) throw new Error(error.message);
    const newUserId = invited.user?.id;
    if (!newUserId) throw new Error("Invitation succeeded but no user id returned");

    // Profile is auto-created by handle_new_user trigger; ensure name is set
    await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName })
      .eq("id", newUserId);

    // New users get no role by default; assign the requested one
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId: newUserId };
  });

const ResendSchema = z.object({ email: z.string().email().max(254) });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ResendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const siteUrl = process.env.SITE_URL || "https://road-source.lovable.app";
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: `${siteUrl}/set-password`,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteSchema = z.object({ userId: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.userId === userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
