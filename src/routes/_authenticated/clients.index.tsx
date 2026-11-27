import { can } from "@/lib/permissions";
import { useTx } from "@/hooks/use-tx";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Briefcase } from "lucide-react";
import { useMyRoles } from "@/hooks/useMyRoles";

export const Route = createFileRoute("/_authenticated/clients/")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Clients \u2014 RoadSource" },
    { name: "description", content: "Browse RoadSource clients and manage their contact details." },
    { property: "og:title", content: "Clients \u2014 RoadSource" },
    { property: "og:description", content: "Browse RoadSource clients and manage their contact details." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ClientsPage,
});

const clientSchema = z.object({
  name: z.string().trim().min(2, "Name too short").max(200),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  contact_name: z.string().trim().max(200).optional().or(z.literal("")),
  contact_email: z.string().trim().email("Invalid email").max(200).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});

type ClientRow = {
  id: string;
  name: string;
  industry: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
};

function ClientsPage() {
  const { tx } = useTx();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const { data: roles } = useMyRoles(user.id);
  const canManage = can(roles, "clients.manage");

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [open, setOpen] = useState(false);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, industry, contact_name, contact_email, contact_phone, notes, created_at")
        .order("name");
      if (error) throw error;
      return data as ClientRow[];
    },
  });

  const { data: demandCounts } = useQuery({
    queryKey: ["clients", "demand-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("demands").select("client_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const d of data ?? []) counts[d.client_id] = (counts[d.client_id] ?? 0) + 1;
      return counts;
    },
  });

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q) ||
        c.contact_name?.toLowerCase().includes(q) ||
        c.contact_email?.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tx("Client deleted", "Client supprimé"));
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(c: ClientRow) {
    setEditing(c);
    setOpen(true);
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm">{tx("Manage client accounts and their demands.", "Gérez les comptes clients et leurs demandes.")}</p>
        </div>
        {canManage && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> {tx("New client", "Nouveau client")}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtered.length} client{filtered.length === 1 ? "" : "s"}
          </CardTitle>
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tx("Search by name, industry, contact...", "Rechercher par nom, secteur, contact...")}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{tx("Loading...", "Chargement...")}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{tx("No clients found.", "Aucun client trouvé.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tx("Name", "Nom")}</TableHead>
                  <TableHead>{tx("Industry", "Secteur")}</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>{tx("Demands", "Demandes")}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: c.id }}
                        className="hover:text-primary hover:underline transition-colors"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.industry || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {c.contact_name && <div>{c.contact_name}</div>}
                      {c.contact_email && (
                        <div className="text-muted-foreground text-xs">{c.contact_email}</div>
                      )}
                      {!c.contact_name && !c.contact_email && "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/demands"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Briefcase className="h-3 w-3" />
                        {demandCounts?.[c.id] ?? 0}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(tx(`Delete client "${c.name}"? This cannot be undone.`, `Supprimer le client « ${c.name} » ? Cette action est irréversible.`))) {
                                deleteMutation.mutate(c.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ClientDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        userId={user.id}
        onSaved={() => qc.invalidateQueries({ queryKey: ["clients"] })}
      />
    </div>
  );
}

function ClientDialog({
  open,
  onOpenChange,
  editing,
  userId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: ClientRow | null;
  userId: string;
  onSaved: () => void;
}) {
  const { tx } = useTx();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // reset form when dialog opens
  useMemo(() => {
    if (open) {
      setName(editing?.name ?? "");
      setIndustry(editing?.industry ?? "");
      setContactName(editing?.contact_name ?? "");
      setContactEmail(editing?.contact_email ?? "");
      setContactPhone(editing?.contact_phone ?? "");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = clientSchema.safeParse({
      name,
      industry,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      notes,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const payload = {
      name: parsed.data.name,
      industry: parsed.data.industry || null,
      contact_name: parsed.data.contact_name || null,
      contact_email: parsed.data.contact_email || null,
      contact_phone: parsed.data.contact_phone || null,
      notes: parsed.data.notes || null,
    };
    try {
      if (editing) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success(tx("Client updated", "Client mis à jour"));
      } else {
        const { error } = await supabase.from("clients").insert({ ...payload, created_by: userId });
        if (error) throw error;
        toast.success(tx("Client created", "Client créé"));
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("Failed to save", "Échec de l'enregistrement"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? tx("Edit client", "Modifier le client") : tx("New client", "Nouveau client")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">{tx("Name *", "Nom *")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry">{tx("Industry", "Secteur")}</Label>
            <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={100} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cname">{tx("Contact name", "Nom du contact")}</Label>
              <Input id="cname" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cphone">{tx("Contact phone", "Téléphone du contact")}</Label>
              <Input id="cphone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={50} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cemail">{tx("Contact email", "E-mail du contact")}</Label>
            <Input id="cemail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tx("Cancel", "Annuler")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? tx("Saving...", "Enregistrement...") : editing ? tx("Save changes", "Enregistrer") : tx("Create client", "Créer le client")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
