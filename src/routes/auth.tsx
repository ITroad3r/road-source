import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
  head: () => ({ meta: [{ title: "Sign in — RoadSource" }] }),
  component: AuthPage,
});

function AuthPage() {
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
      toast.success("If that account exists, a reset link is on its way.");
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
            {resetMode ? "Enter your email and we'll send a reset link." : t("auth.subtitle")}
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
                Forgot your password?
              </button>
              <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                RoadSource is invitation-only. Contact your administrator for access.
              </p>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="r-email">{t("auth.email")}</Label>
                <Input id="r-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
              <button
                type="button"
                onClick={() => setResetMode(false)}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Back to sign in
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
