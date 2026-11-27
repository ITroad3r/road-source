import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useTx } from "@/hooks/use-tx";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RoadSourceLogo } from "@/components/RoadSourceLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Sign in \u2014 RoadSource" },
    { name: "description", content: "Sign in to your invitation-only RoadSource workspace." },
    { property: "og:title", content: "Sign in \u2014 RoadSource" },
    { property: "og:description", content: "Sign in to your invitation-only RoadSource workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const { tx } = useTx();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success(t("auth.signedIn"));
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success(tx("If that account exists, a reset link is on its way.", "Si ce compte existe, un lien de réinitialisation vous a été envoyé."));
      setResetMode(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4"><LanguageSwitcher /></div>
      <Card className="w-full max-w-md shadow-md rounded-xl border-border/70">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <RoadSourceLogo showWordmark={false} />
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight">{t("auth.title")}</CardTitle>
          <CardDescription>
            {resetMode ? tx("Enter your email and we'll send a reset link.", "Saisissez votre e-mail et nous vous enverrons un lien de réinitialisation.") : t("auth.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!resetMode ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="si-email">{t("auth.email")}</Label>
                <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="si-pw">{t("auth.password")}</Label>
                <Input id="si-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("common.signingIn") : t("auth.submitSignIn")}
              </Button>
              <button
                type="button"
                onClick={() => setResetMode(true)}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {tx("Forgot your password?", "Mot de passe oublié ?")}
              </button>
              <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                {tx("RoadSource is invitation-only. Contact your administrator for access.", "RoadSource est accessible sur invitation uniquement. Contactez votre administrateur.")}
              </p>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="r-email">{t("auth.email")}</Label>
                <Input id="r-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? tx("Sending…", "Envoi…") : tx("Send reset link", "Envoyer le lien")}
              </Button>
              <button
                type="button"
                onClick={() => setResetMode(false)}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {tx("Back to sign in", "Retour à la connexion")}
              </button>
            </form>
          )}
          <div className="mt-5 text-center">
            <Link to="/" className="text-sm font-medium text-primary hover:underline">
              {t("auth.backHome")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
