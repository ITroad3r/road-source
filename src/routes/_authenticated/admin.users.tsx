import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Shield, Search, Plus, X, User as UserIcon, UserPlus, Mail, Trash2 } from "lucide-react";
import { useMyRoles, AppRole, ROLE_LABEL } from "@/hooks/useMyRoles";
import { inviteUser, resendInvite, deleteUser } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  ssr: false,
  head: () => ({ meta: [{ title: "Users & roles — RoadSource" }] }),
  component: AdminUsers,
});

const ROLES: AppRole[] = ["sourcing_team", "division_manager", "division_director", "ceo", "admin"];

const roleColors: Record<AppRole, string> = {
  admin: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  ceo: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  division_director: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  division_manager: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  sourcing_team: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
};

function AdminUsers() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const invite = useServerFn(inviteUser);
  const resend = useServerFn(resendInvite);
  const del = useServerFn(deleteUser);

  const { data: myRoles, isLoading: rolesLoading } = useMyRoles(user.id);

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    enabled: !!myRoles?.includes("admin"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, seniority, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allRoles } = useQuery({
    queryKey: ["admin-all-roles"],
    enabled: !!myRoles?.includes("admin"),
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("id, user_id, role");
      if (error) throw error;
      return data as { id: string; user_id: string; role: AppRole }[];
    },
  });

  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-all-roles"] }); toast.success("Role added"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-all-roles"] }); toast.success("Role removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMut = useMutation({
    mutationFn: async (vars: { email: string; fullName: string; role: AppRole }) =>
      invite({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-all-roles"] });
      toast.success("Invitation sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendMut = useMutation({
    mutationFn: async (email: string) => resend({ data: { email } }),
    onSuccess: () => toast.success("Invitation re-sent"),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (userId: string) => del({ data: { userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-all-roles"] });
      toast.success("User deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rolesLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!myRoles?.includes("admin")) return <Navigate to="/dashboard" />;

  const rolesByUser = new Map<string, { id: string; role: AppRole }[]>();
  (allRoles ?? []).forEach((r) => {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push({ id: r.id, role: r.role });
    rolesByUser.set(r.user_id, arr);
  });

  const term = q.trim().toLowerCase();
  const filtered = (profiles ?? []).filter((p) =>
    !term || p.email.toLowerCase().includes(term) || (p.full_name ?? "").toLowerCase().includes(term)
  );

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Shield className="h-7 w-7" /> Users &amp; roles</h1>
          <p className="text-muted-foreground mt-1">Invite teammates, assign their role, and manage access. Invitees receive an email to complete their profile.</p>
        </div>
        <InviteUserDialog onSubmit={(v) => inviteMut.mutateAsync(v)} loading={inviteMut.isPending} />
      </header>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{filtered.length} user{filtered.length === 1 ? "" : "s"}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="w-48">Add role</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users match.</TableCell></TableRow>
              )}
              {filtered.map((p) => {
                const userRoles = rolesByUser.get(p.id) ?? [];
                const heldRoles = new Set(userRoles.map((r) => r.role));
                const available = ROLES.filter((r) => !heldRoles.has(r));
                const isSelf = p.id === user.id;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{p.full_name ?? "—"} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}</div>
                          {p.seniority && <div className="text-xs text-muted-foreground capitalize">{p.seniority}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {userRoles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                        {userRoles.map((r) => (
                          <Badge key={r.id} variant="outline" className={`gap-1 ${roleColors[r.role]}`}>
                            {ROLE_LABEL[r.role]}
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelf && r.role === "admin") {
                                  const adminCount = (allRoles ?? []).filter((x) => x.role === "admin").length;
                                  if (adminCount <= 1) return toast.error("Cannot remove the last admin");
                                }
                                removeRole.mutate(r.id);
                              }}
                              className="hover:text-foreground"
                              aria-label={`Remove ${r.role}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AddRoleControl available={available} onAdd={(role) => addRole.mutate({ userId: p.id, role })} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" title="Resend invitation"
                          onClick={() => resendMut.mutate(p.email)} disabled={resendMut.isPending}>
                          <Mail className="h-3.5 w-3.5" />
                        </Button>
                        {!isSelf && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" title="Delete user">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {p.full_name ?? p.email}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This permanently removes the user account and their access. Data they created stays.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMut.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete user
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AddRoleControl({ available, onAdd }: { available: AppRole[]; onAdd: (role: AppRole) => void }) {
  const [val, setVal] = useState<string>("");
  if (available.length === 0) return <span className="text-xs text-muted-foreground">All assigned</span>;
  return (
    <div className="flex gap-1">
      <Select value={val} onValueChange={setVal}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select role" /></SelectTrigger>
        <SelectContent>
          {available.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={!val} onClick={() => { onAdd(val as AppRole); setVal(""); }}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function InviteUserDialog({ onSubmit, loading }: { onSubmit: (v: { email: string; fullName: string; role: AppRole }) => Promise<unknown>; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("sourcing_team");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="h-4 w-4 mr-2" /> Invite user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a new user</DialogTitle>
          <DialogDescription>They'll receive an email invitation to set their password and complete their profile.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSubmit({ email, fullName, role });
            setEmail(""); setFullName(""); setRole("sourcing_team"); setOpen(false);
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="iv-name">Full name</Label>
            <Input id="iv-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iv-email">Email</Label>
            <Input id="iv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Sending…" : "Send invitation"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
