import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useTx } from "@/hooks/use-tx";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RoadSourceLogo } from "@/components/RoadSourceLogo";

export const Route = createFileRoute("/set-password")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Set your password \u2014 RoadSource" },
    { name: "description", content: "Complete your RoadSource invitation or securely reset your account password." },
    { property: "og:title", content: "Set your password \u2014 RoadSource" },
    { property: "og:description", content: "Complete your RoadSource invitation or securely reset your account password." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const { tx } = useTx();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        toast.error(tx("Your invitation link is invalid or expired. Ask your admin to resend it.", "Votre lien d'invitation est invalide ou expiré. Demandez à votre administrateur de le renvoyer."));
        navigate({ to: "/auth", replace: true });
        return;
      }
      const meta = data.session.user.user_metadata as { full_name?: string } | null;
      if (meta?.full_name) setFullName(meta.full_name);
      setReady(true);
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error(tx("Password must be at least 8 characters", "Le mot de passe doit contenir au moins 8 caractères"));
    if (password !== confirm) return toast.error(tx("Passwords do not match", "Les mots de passe ne correspondent pas"));
    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName },
    });
    if (!error) {
      await supabase.from("profiles").update({ full_name: fullName }).eq("id", (await supabase.auth.getUser()).data.user!.id);
    }
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(tx("Welcome to RoadSource", "Bienvenue sur RoadSource"));
    navigate({ to: "/dashboard", replace: true });
  }

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{tx("Loading…", "Chargement…")}</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-md rounded-xl border-border/70">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center"><RoadSourceLogo showWordmark={false} /></div>
          <CardTitle className="text-2xl font-extrabold tracking-tight">{tx("Welcome to RoadSource", "Bienvenue sur RoadSource")}</CardTitle>
          <CardDescription>{tx("Complete your profile and choose a password to get started.", "Complétez votre profil et choisissez un mot de passe pour commencer.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{tx("Full name", "Nom complet")}</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">{tx("New password", "Nouveau mot de passe")}</Label>
              <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">{tx("Confirm password", "Confirmer le mot de passe")}</Label>
              <Input id="pw2" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? tx("Saving…", "Enregistrement…") : tx("Set password & enter", "Définir le mot de passe et entrer")}
            </Button>
          </form>
          <div className="mt-5 text-center">
            <Link to="/auth" className="text-sm text-muted-foreground hover:underline">{tx("Back to sign in", "Retour à la connexion")}</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
