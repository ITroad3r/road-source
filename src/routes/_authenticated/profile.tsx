import { createFileRoute } from "@tanstack/react-router";
import { useTx } from "@/hooks/use-tx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { User, Mail, Pencil, Save, X } from "lucide-react";
import { useMyRoles } from "@/hooks/useMyRoles";

export const Route = createFileRoute("/_authenticated/profile")({
  ssr: false,
  head: () => ({ meta: [
    { title: "My Profile \u2014 RoadSource" },
    { name: "description", content: "Review and update your RoadSource profile information." },
    { property: "og:title", content: "My Profile \u2014 RoadSource" },
    { property: "og:description", content: "Review and update your RoadSource profile information." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ProfilePage,
});

const profileSchema = z.object({
  full_name: z.string().trim().max(200).optional().or(z.literal("")),
  avatar_url: z.string().trim().url("Invalid URL").max(1000).optional().or(z.literal("")),
  seniority: z.enum(["junior", "mid", "senior", "lead", "principal"]).optional().or(z.literal("")),
});

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  seniority: string | null;
  created_at: string;
  updated_at: string;
};

const seniorityLabels: Record<string, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
};

function ProfilePage() {
  const { tx } = useTx();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: roles } = useMyRoles(user.id);

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [seniority, setSeniority] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, seniority, created_at, updated_at")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data as ProfileRow;
    },
  });

  // Seed form when profile loads or entering edit mode
  useMemo(() => {
    if (profile && isEditing) {
      setFullName(profile.full_name ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
      setSeniority(profile.seniority ?? "");
    }
  }, [profile, isEditing]);

  const updateMutation = useMutation({
    mutationFn: async (values: { full_name: string | null; avatar_url: string | null; seniority: Database["public"]["Enums"]["seniority_level"] | null }) => {
      const { error } = await supabase.from("profiles").update(values).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tx("Profile updated", "Profil mis à jour"));
      qc.invalidateQueries({ queryKey: ["profile"] });
      setIsEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileSchema.safeParse({ full_name: fullName, avatar_url: avatarUrl, seniority });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    updateMutation.mutate(
      {
        full_name: parsed.data.full_name || null,
        avatar_url: parsed.data.avatar_url || null,
        seniority: parsed.data.seniority || null,
      },
      { onSettled: () => setSubmitting(false) }
    );
  }

  const initials = (profile?.full_name ?? user.email ?? "?")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{tx("My Profile", "Mon profil")}</h1>
        <p className="text-muted-foreground mt-1">{tx("View and manage your account details.", "Consultez et gérez les informations de votre compte.")}</p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{tx("Loading profile…", "Chargement du profil…")}</p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-xl">{profile?.full_name || tx("No name set", "Aucun nom défini")}</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Mail className="h-3.5 w-3.5" />
                      {user.email}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {roles?.map((r) => (
                        <Badge key={r} variant="secondary" className="capitalize text-xs">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                {!isEditing && (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Pencil className="h-4 w-4 mr-2" /> {tx("Edit", "Modifier")}
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {!isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{tx("Full name", "Nom complet")}</div>
                    <div className="text-sm font-medium mt-1">{profile?.full_name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{tx("Seniority", "Séniorité")}</div>
                    <div className="text-sm font-medium mt-1">
                      {profile?.seniority ? (profile.seniority === "mid" ? tx("Mid-level", "Confirmé") : seniorityLabels[profile.seniority] ?? profile.seniority) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{tx("Member since", "Membre depuis")}</div>
                    <div className="text-sm font-medium mt-1">
                      {profile?.created_at
                        ? new Date(profile.created_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{tx("Last updated", "Dernière mise à jour")}</div>
                    <div className="text-sm font-medium mt-1">
                      {profile?.updated_at
                        ? new Date(profile.updated_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : "—"}
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="full_name">{tx("Full name", "Nom complet")}</Label>
                    <Input
                      id="full_name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={tx("Your full name", "Votre nom complet")}
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="seniority">{tx("Seniority", "Séniorité")}</Label>
                    <select
                      id="seniority"
                      value={seniority}
                      onChange={(e) => setSeniority(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">{tx("Select seniority…", "Choisir la séniorité…")}</option>
                      <option value="junior">Junior</option>
                      <option value="mid">{tx("Mid-level", "Confirmé")}</option>
                      <option value="senior">Senior</option>
                      <option value="lead">Lead</option>
                      <option value="principal">Principal</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="avatar_url">{tx("Avatar URL", "URL de l'avatar")}</Label>
                    <Input
                      id="avatar_url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/avatar.jpg"
                      maxLength={1000}
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button type="submit" disabled={submitting}>
                      <Save className="h-4 w-4 mr-2" />
                      {submitting ? tx("Saving…", "Enregistrement…") : tx("Save changes", "Enregistrer")}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                      <X className="h-4 w-4 mr-2" /> {tx("Cancel", "Annuler")}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
