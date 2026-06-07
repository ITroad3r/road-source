import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
  head: () => ({ meta: [{ title: "Set your password — RoadSource" }] }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        toast.error("Your invitation link is invalid or expired. Ask your admin to resend it.");
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
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
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
    toast.success("Welcome to RoadSource");
    navigate({ to: "/dashboard", replace: true });
  }

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-md rounded-xl border-border/70">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center"><RoadSourceLogo showWordmark={false} /></div>
          <CardTitle className="text-2xl font-extrabold tracking-tight">Welcome to RoadSource</CardTitle>
          <CardDescription>Complete your profile and choose a password to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Set password & enter"}
            </Button>
          </form>
          <div className="mt-5 text-center">
            <Link to="/auth" className="text-sm text-muted-foreground hover:underline">Back to sign in</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
