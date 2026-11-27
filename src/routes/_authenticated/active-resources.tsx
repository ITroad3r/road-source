import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/hooks/useMyRoles";
import { can } from "@/lib/permissions";
import { useTx } from "@/hooks/use-tx";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashHeader } from "@/components/dashboards/shared";
import { ResourceAnalytics } from "@/components/resources/ResourceAnalytics";
import { isActiveOn, monthlyFigures, type PayType, type ResourceFinancials } from "@/lib/active-resources";

export const Route = createFileRoute("/_authenticated/active-resources")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Active Resources — RoadSource" },
    { name: "description", content: "Placed resources currently working at RoadSource clients." },
    { property: "og:title", content: "Active Resources — RoadSource" },
    { property: "og:description", content: "Placed resources currently working at RoadSource clients." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ActiveResourcesAccess,
});

type ContractType = "cdi" | "cdd" | "freelance";
type Resource = {
  id: string; client_id: string; full_name: string; job_title: string | null; email: string | null; phone: string | null;
  start_date: string; end_date: string | null; contract_type: ContractType | null; notes: string | null; demand_candidate_id: string | null;
  clients: { name: string } | null;
};

function ActiveResourcesAccess() {
  const { user } = Route.useRouteContext();
  const { data: roles, isPending, isError } = useMyRoles(user.id);
  const { t } = useTranslation();
  if (isPending) return <div className="p-4 text-muted-foreground">{t("common.loading")}</div>;
  if (isError || !can(roles, "resources.manage")) return <Navigate to="/dashboard" replace />;
  return <ActiveResourcesPage canFin={can(roles, "resources.financials")} canAnalytics={can(roles, "resources.analytics")} />;
}

function ActiveResourcesPage({ canFin, canAnalytics }: { canFin: boolean; canAnalytics: boolean }) {
  const { tx, locale } = useTx();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [client, setClient] = useState("all");
  const [status, setStatus] = useState<"active" | "left" | "all">("active");
  const [editing, setEditing] = useState<Resource | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const resources = useQuery({
    queryKey: ["active-resources"],
    queryFn: async () => {
      const { data, error } = await supabase.from("active_resources")
        .select("id, client_id, full_name, job_title, email, phone, start_date, end_date, contract_type, notes, demand_candidate_id, clients(name)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as unknown as Resource[];
    },
  });
  // Pay data is requested only by roles allowed to see it (RLS blocks others anyway).
  const fins = useQuery({
    queryKey: ["active-resource-financials"],
    enabled: canFin,
    queryFn: async () => {
      const { data, error } = await supabase.from("active_resource_financials").select("resource_id, pay_type, cost_amount, sell_amount, currency");
      if (error) throw error;
      return new Map(data.map((f) => [f.resource_id, { pay_type: f.pay_type as PayType, cost_amount: f.cost_amount, sell_amount: f.sell_amount, currency: f.currency }]));
    },
  });
  const clients = useQuery({
    queryKey: ["clients", "names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const rows = resources.data ?? [];
  const finOf = (id: string): ResourceFinancials | null => fins.data?.get(id) ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (client !== "all" && r.client_id !== client) return false;
      const active = isActiveOn(r, today) || r.start_date > today;
      if (status === "active" && !active) return false;
      if (status === "left" && active) return false;
      if (!q) return true;
      return [r.full_name, r.job_title, r.email, r.phone, r.clients?.name].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, search, client, status, today]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("active_resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(tx("Resource deleted", "Ressource supprimée")); qc.invalidateQueries({ queryKey: ["active-resources"] }); qc.invalidateQueries({ queryKey: ["active-resource-financials"] }); setDeleting(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(locale);
  const money = (n: number, cur = "EUR") => new Intl.NumberFormat(locale, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  const contractLabel = (c: ContractType | null) => c === "cdi" ? "CDI" : c === "cdd" ? "CDD" : c === "freelance" ? "Freelance" : "—";

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <DashHeader title={tx("Active Resources", "Ressources actives")} subtitle={tx("People placed and currently working at our clients.", "Personnes placées et actuellement en mission chez nos clients.")}>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />{tx("Add resource", "Ajouter une ressource")}</Button>
      </DashHeader>

      {canAnalytics && <ResourceAnalytics rows={rows.map((r) => ({ id: r.id, client_id: r.client_id, clientName: r.clients?.name ?? "—", start_date: r.start_date, end_date: r.end_date, fin: finOf(r.id) }))} />}

      <Card><CardContent className="p-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_180px]">
        <div className="relative"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={tx("Search resources", "Rechercher des ressources")} placeholder={tx("Search name, job, email, mobile…", "Rechercher nom, poste, e-mail, mobile…")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={client} onValueChange={setClient}>
          <SelectTrigger aria-label={tx("Client", "Client")}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{tx("All clients", "Tous les clients")}</SelectItem>{(clients.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger aria-label={tx("Status", "Statut")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{tx("Active", "Actifs")}</SelectItem>
            <SelectItem value="left">{tx("Left", "Sortis")}</SelectItem>
            <SelectItem value="all">{tx("All", "Tous")}</SelectItem>
          </SelectContent>
        </Select>
      </CardContent></Card>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{tx("Resource", "Ressource")}</TableHead>
            <TableHead>{tx("Client", "Client")}</TableHead>
            <TableHead>{tx("Start date", "Date de début")}</TableHead>
            <TableHead>{tx("Mobile", "Mobile")}</TableHead>
            <TableHead>{tx("Email", "E-mail")}</TableHead>
            {canFin && <TableHead className="text-right">{tx("Monthly pay", "Salaire mensuel")}</TableHead>}
            {canFin && <TableHead className="text-right">{tx("Monthly selling price", "Prix de vente mensuel")}</TableHead>}
            {canAnalytics && <TableHead className="text-right">{tx("Monthly profit", "Marge mensuelle")}</TableHead>}
            <TableHead className="w-24" />
          </TableRow></TableHeader>
          <TableBody>
            {resources.isLoading ? <TableRow><TableCell colSpan={9} className="text-muted-foreground">{tx("Loading…", "Chargement…")}</TableCell></TableRow>
            : resources.isError ? <TableRow><TableCell colSpan={9} className="text-destructive">{tx("Could not load resources.", "Impossible de charger les ressources.")}</TableCell></TableRow>
            : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{tx("No resources match your filters.", "Aucune ressource ne correspond à vos filtres.")}</TableCell></TableRow>
            : filtered.map((r) => {
              const f = finOf(r.id); const m = monthlyFigures(f); const cur = f?.currency ?? "EUR";
              const left = !(isActiveOn(r, today) || r.start_date > today);
              return (
                <TableRow key={r.id}>
                  <TableCell><div className="font-medium flex items-center gap-2">{r.full_name}{left && <Badge variant="secondary">{tx("Left", "Sorti")} {r.end_date && fmtDate(r.end_date)}</Badge>}</div>
                    <div className="text-xs text-muted-foreground">{[r.job_title, contractLabel(r.contract_type)].filter((v) => v && v !== "—").join(" · ")}</div></TableCell>
                  <TableCell>{r.clients?.name ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.start_date)}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.phone ? <a className="hover:underline" href={`tel:${r.phone}`}>{r.phone}</a> : "—"}</TableCell>
                  <TableCell>{r.email ? <a className="hover:underline break-all" href={`mailto:${r.email}`}>{r.email}</a> : "—"}</TableCell>
                  {canFin && <TableCell className="text-right whitespace-nowrap">{f?.cost_amount != null ? <>{money(m.cost, cur)}{f.pay_type === "daily" && <div className="text-[11px] text-muted-foreground">{tx("TJM", "TJM")} {money(f.cost_amount, cur)}</div>}</> : "—"}</TableCell>}
                  {canFin && <TableCell className="text-right whitespace-nowrap">{f?.sell_amount != null ? <>{money(m.sell, cur)}{f.pay_type === "daily" && <div className="text-[11px] text-muted-foreground">{tx("Daily", "Jour")} {money(f.sell_amount, cur)}</div>}</> : "—"}</TableCell>}
                  {canAnalytics && <TableCell className={`text-right whitespace-nowrap font-medium ${m.profit < 0 ? "text-destructive" : ""}`}>{f ? money(m.profit, cur) : "—"}</TableCell>}
                  <TableCell><div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" aria-label={tx(`Edit ${r.full_name}`, `Modifier ${r.full_name}`)} onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={tx(`Delete ${r.full_name}`, `Supprimer ${r.full_name}`)} onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      <ResourceDialog open={open} onOpenChange={setOpen} editing={editing} fin={editing ? finOf(editing.id) : null} canFin={canFin} clients={clients.data ?? []} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{tx("Delete this resource?", "Supprimer cette ressource ?")}</AlertDialogTitle>
            <AlertDialogDescription>{tx(`${deleting?.full_name ?? ""} will be removed from the list. To keep history, set a leave date instead.`, `${deleting?.full_name ?? ""} sera retiré(e) de la liste. Pour garder l'historique, indiquez plutôt une date de sortie.`)}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{tx("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleting) del.mutate(deleting.id); }} disabled={del.isPending}>{tx("Delete", "Supprimer")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ResourceDialog({ open, onOpenChange, editing, fin, canFin, clients }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: Resource | null; fin: ResourceFinancials | null; canFin: boolean; clients: { id: string; name: string }[];
}) {
  const { tx } = useTx();
  const qc = useQueryClient();
  const init = () => ({
    full_name: editing?.full_name ?? "", client_id: editing?.client_id ?? "", job_title: editing?.job_title ?? "", email: editing?.email ?? "", phone: editing?.phone ?? "",
    start_date: editing?.start_date ?? new Date().toISOString().slice(0, 10), end_date: editing?.end_date ?? "", contract_type: (editing?.contract_type ?? "none") as ContractType | "none", notes: editing?.notes ?? "",
    pay_type: (fin?.pay_type ?? "monthly") as PayType, cost: fin?.cost_amount != null ? String(fin.cost_amount) : "", sell: fin?.sell_amount != null ? String(fin.sell_amount) : "", currency: fin?.currency ?? "EUR",
  });
  const [form, setForm] = useState(init);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? `${editing?.id ?? "new"}:${fin ? "f" : ""}` : null;
  if (key !== lastKey) { setLastKey(key); if (open) setForm(init()); }
  const set = <K extends keyof ReturnType<typeof init>>(k: K, v: ReturnType<typeof init>[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const amount = z.union([z.literal(""), z.coerce.number().min(0)]);
      const parsed = z.object({
        full_name: z.string().trim().min(2, tx("Name too short", "Nom trop court")).max(200),
        client_id: z.string().uuid(tx("Select a client", "Sélectionnez un client")),
        job_title: z.string().trim().max(200), email: z.union([z.literal(""), z.string().trim().email()]), phone: z.string().trim().max(50),
        start_date: z.string().min(10, tx("Start date required", "Date de début requise")), end_date: z.string(), notes: z.string().max(4000),
        cost: amount, sell: amount, currency: z.string().trim().length(3),
      }).refine((v) => !v.end_date || v.end_date >= v.start_date, { message: tx("Leave date must be after start date", "La date de sortie doit suivre la date de début") }).safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid");
      const v = parsed.data;
      const payload = {
        full_name: v.full_name, client_id: v.client_id, job_title: v.job_title || null, email: v.email || null, phone: v.phone || null,
        start_date: v.start_date, end_date: v.end_date || null, contract_type: form.contract_type === "none" ? null : form.contract_type, notes: v.notes || null,
      };
      let id = editing?.id;
      if (id) {
        const { error } = await supabase.from("active_resources").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { data, error } = await supabase.from("active_resources").insert({ ...payload, created_by: u.user?.id ?? null }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (canFin && id) {
        const { error } = await supabase.from("active_resource_financials").upsert({
          resource_id: id, pay_type: form.pay_type, cost_amount: v.cost === "" ? null : v.cost, sell_amount: v.sell === "" ? null : v.sell, currency: v.currency.toUpperCase(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? tx("Resource updated", "Ressource mise à jour") : tx("Resource added", "Ressource ajoutée"));
      qc.invalidateQueries({ queryKey: ["active-resources"] }); qc.invalidateQueries({ queryKey: ["active-resource-financials"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unit = form.pay_type === "daily" ? tx("per day", "par jour") : tx("per month", "par mois");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5 text-primary" />{editing ? tx("Edit resource", "Modifier la ressource") : tx("Add resource", "Ajouter une ressource")}</DialogTitle>
          <DialogDescription>{tx("Main details of the person working at the client.", "Informations principales de la personne en mission chez le client.")}</DialogDescription></DialogHeader>
        <form id="resource-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="r-name">{tx("Full name", "Nom complet")} *</Label><Input id="r-name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{tx("Client", "Client")} *</Label>
            <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}><SelectTrigger aria-label={tx("Client", "Client")}><SelectValue placeholder={tx("Select a client", "Sélectionnez un client")} /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="r-job">{tx("Job title", "Poste")}</Label><Input id="r-job" value={form.job_title} onChange={(e) => set("job_title", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{tx("Contract type", "Type de contrat")}</Label>
            <Select value={form.contract_type} onValueChange={(v) => set("contract_type", v as ContractType | "none")}><SelectTrigger aria-label={tx("Contract type", "Type de contrat")}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem><SelectItem value="cdi">CDI</SelectItem><SelectItem value="cdd">CDD</SelectItem><SelectItem value="freelance">Freelance</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="r-phone">{tx("Mobile", "Mobile")}</Label><Input id="r-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="r-email">{tx("Email", "E-mail")}</Label><Input id="r-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="r-start">{tx("Job start date", "Date de début de mission")} *</Label><Input id="r-start" type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="r-end">{tx("Leave date (if left)", "Date de sortie (si sorti)")}</Label><Input id="r-end" type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>
          {canFin && (
            <fieldset className="sm:col-span-2 grid gap-4 sm:grid-cols-2 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">{tx("Compensation", "Rémunération")}</legend>
              <div className="space-y-1.5"><Label>{tx("Pay basis", "Base de rémunération")}</Label>
                <Select value={form.pay_type} onValueChange={(v) => set("pay_type", v as PayType)}><SelectTrigger aria-label={tx("Pay basis", "Base de rémunération")}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="monthly">{tx("Monthly salary", "Salaire mensuel")}</SelectItem><SelectItem value="daily">{tx("Daily rate (TJM)", "Taux journalier (TJM)")}</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="r-cur">{tx("Currency", "Devise")}</Label><Input id="r-cur" maxLength={3} value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></div>
              <div className="space-y-1.5"><Label htmlFor="r-cost">{tx("What we pay", "Ce que nous payons")} ({unit})</Label><Input id="r-cost" type="number" min="0" step="any" value={form.cost} onChange={(e) => set("cost", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="r-sell">{tx("Selling price to client", "Prix de vente au client")} ({unit})</Label><Input id="r-sell" type="number" min="0" step="any" value={form.sell} onChange={(e) => set("sell", e.target.value)} /></div>
              {form.pay_type === "daily" && <p className="sm:col-span-2 text-xs text-muted-foreground">{tx("Daily rates are counted as 20 working days per month.", "Les taux journaliers comptent 20 jours ouvrés par mois.")}</p>}
            </fieldset>
          )}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="r-notes">{tx("Notes", "Notes")}</Label><Textarea id="r-notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </form>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{tx("Cancel", "Annuler")}</Button>
          <Button type="submit" form="resource-form" disabled={save.isPending}>{tx("Save", "Enregistrer")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
