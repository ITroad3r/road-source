import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Send, Copy, Mail, Loader2 } from "lucide-react";

type Candidate = {
  id: string;
  stage: string;
  qualification_status: string;
  final_decision: string;
  cv: {
    id: string;
    full_name: string;
    headline: string | null;
    seniority?: string | null;
    years_experience?: number | null;
    daily_rate?: number | null;
    location?: string | null;
    skills?: string[] | null;
    cv_url?: string | null;
    linkedin_url?: string | null;
  } | null;
};

const SIGN_TTL_HOURS = 24;

export function SendPackageDialog({
  open,
  onOpenChange,
  demand,
  candidates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  demand: { id: string; title: string; clients: { name: string; contact_email?: string | null; contact_name?: string | null } | null };
  candidates: Candidate[];
}) {
  const eligible = useMemo(
    () => candidates.filter((c) => c.cv && c.qualification_status === "qualified" && c.final_decision === "approved" && ["submitted", "screened", "client_interview", "offer"].includes(c.stage)),
    [candidates]
  );
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(eligible.filter((c) => c.stage === "submitted").map((c) => [c.id, true]))
  );
  const [to, setTo] = useState(demand.clients?.contact_email ?? "");
  const [subject, setSubject] = useState(`Candidate package — ${demand.title}`);
  const [intro, setIntro] = useState(
    `Hello ${demand.clients?.contact_name ?? ""},\n\nPlease find below the candidate package for "${demand.title}". CV links expire in ${SIGN_TTL_HOURS} hours.\n`.trimStart()
  );
  const [building, setBuilding] = useState(false);
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState<string | null>(null);

  const selectedRows = eligible.filter((c) => selected[c.id]);

  async function build() {
    if (selectedRows.length === 0) return toast.error("Pick at least one candidate");
    setBuilding(true);
    try {
      const rows = await Promise.all(
        selectedRows.map(async (c) => {
          let cvLink: string | null = null;
          if (c.cv?.cv_url) {
            if (/^https?:\/\//i.test(c.cv.cv_url)) {
              cvLink = c.cv.cv_url;
            } else {
              const { data, error } = await supabase.storage
                .from("cvs")
                .createSignedUrl(c.cv.cv_url, SIGN_TTL_HOURS * 3600);
              if (!error && data) cvLink = data.signedUrl;
            }
          }
          return { c, cvLink };
        })
      );

      const tableRows = rows
        .map(({ c, cvLink }) => {
          const cv = c.cv!;
          return `<tr>
            <td style="padding:8px;border:1px solid #e5e7eb;"><strong>${escape(cv.full_name)}</strong>${cv.headline ? `<br/><span style="color:#6b7280;font-size:12px;">${escape(cv.headline)}</span>` : ""}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${cv.seniority ? escape(cv.seniority) : "—"}${cv.years_experience != null ? ` · ${cv.years_experience}y` : ""}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${cv.location ? escape(cv.location) : "—"}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${cv.daily_rate != null ? `€${cv.daily_rate}/d` : "—"}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${(cv.skills ?? []).slice(0, 6).map(escape).join(", ") || "—"}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${cvLink ? `<a href="${cvLink}">CV</a>` : "—"}${cv.linkedin_url ? ` · <a href="${escape(cv.linkedin_url)}">LinkedIn</a>` : ""}</td>
          </tr>`;
        })
        .join("");

      const html = `<div style="font-family:Arial,sans-serif;color:#111827;">
<p>${escape(intro).replace(/\n/g, "<br/>")}</p>
<table style="border-collapse:collapse;width:100%;font-size:13px;">
  <thead><tr style="background:#f3f4f6;">
    <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Candidate</th>
    <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Seniority</th>
    <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Location</th>
    <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Rate</th>
    <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Skills</th>
    <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Links</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<p style="color:#6b7280;font-size:12px;margin-top:16px;">CV links expire in ${SIGN_TTL_HOURS} hours.</p>
</div>`;

      const textRows = rows.map(({ c, cvLink }) => {
        const cv = c.cv!;
        const parts = [
          `• ${cv.full_name}${cv.headline ? ` — ${cv.headline}` : ""}`,
          `  ${cv.seniority ?? "—"}${cv.years_experience != null ? ` · ${cv.years_experience}y` : ""} · ${cv.location ?? "—"}${cv.daily_rate != null ? ` · €${cv.daily_rate}/d` : ""}`,
          (cv.skills ?? []).length ? `  Skills: ${(cv.skills ?? []).slice(0, 8).join(", ")}` : null,
          cvLink ? `  CV: ${cvLink}` : null,
          cv.linkedin_url ? `  LinkedIn: ${cv.linkedin_url}` : null,
        ].filter(Boolean);
        return parts.join("\n");
      }).join("\n\n");
      const text = `${intro}\n${textRows}\n\nCV links expire in ${SIGN_TTL_HOURS} hours.`;

      setBodyHtml(html);
      setBodyText(text);
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to build package");
    } finally {
      setBuilding(false);
    }
  }

  async function copyHtml() {
    if (!bodyHtml) return;
    try {
      const blob = new Blob([bodyHtml], { type: "text/html" });
      await navigator.clipboard.write([new ClipboardItem({ "text/html": blob, "text/plain": new Blob([bodyText ?? ""], { type: "text/plain" }) })]);
      toast.success("Copied — paste into your email client");
    } catch {
      await navigator.clipboard.writeText(bodyText ?? "");
      toast.success("Copied as plain text");
    }
  }

  function openMail() {
    if (!bodyText) return;
    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    window.location.href = href;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Send candidate package</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Intro message</Label>
            <Textarea rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Candidates ({selectedRows.length} selected / {eligible.length} eligible)</Label>
            <div className="border rounded-md divide-y max-h-56 overflow-y-auto">
              {eligible.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">
                  No eligible candidates. Move them to Submitted / Screened / Interview / Offer first.
                </div>
              )}
              {eligible.map((c) => (
                <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-accent cursor-pointer">
                  <Checkbox checked={!!selected[c.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [c.id]: !!v }))} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.cv!.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.cv!.headline ?? "—"} · {c.stage.replace("_", " ")}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={build} disabled={building || selectedRows.length === 0}>
              {building ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Build package
            </Button>
          </div>

          {bodyHtml && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div
                className="border rounded-md p-3 bg-background max-h-72 overflow-auto text-sm"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={copyHtml}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
                <Button onClick={openMail} disabled={!to}><Mail className="h-4 w-4 mr-1" /> Open in mail client</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
