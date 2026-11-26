import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PdfDocumentView } from "./PdfDocumentView";

export function CandidateDocumentPreview({ path, name, bucket = "cvs", label = "CV" }: { path: string | null; name: string; bucket?: string; label?: string }) {
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const wordRef = useRef<HTMLDivElement>(null);
  const isWord = /\.docx(?:\?|$)/i.test(path ?? "");
  const legacyWord = /\.doc(?:\?|$)/i.test(path ?? "");
  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setLoading(true); setError(""); setUrl(null);
    async function load() {
      try {
        const resolved = /^https:\/\//i.test(path ?? "") ? path : (await supabase.storage.from(bucket).createSignedUrl(path ?? "", 600)).data?.signedUrl;
        if (!resolved) throw new Error(fr ? "Document indisponible" : "Document unavailable");
        if (cancelled) return;
        setUrl(resolved);
        if (isWord) {
          const response = await fetch(resolved);
          if (!response.ok) throw new Error(fr ? "Document indisponible" : "Document unavailable");
          const data = await response.arrayBuffer();
          const { renderAsync } = await import("docx-preview");
          if (!cancelled && wordRef.current) {
            wordRef.current.replaceChildren();
            await renderAsync(data, wordRef.current, undefined, { inWrapper: false, breakPages: true });
          }
        }
      } catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [open, path, bucket, isWord, fr]);
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={!path} title={!path ? (fr ? "Aucun CV joint" : "No CV attached") : label} onClick={() => setOpen(true)}><FileText className="h-3 w-3" />{label}</Button>
    <DialogContent className="w-[calc(100%-1rem)] max-w-5xl max-h-[90dvh] overflow-auto">
      <DialogHeader className="pr-7"><DialogTitle className="break-words">{name} · {label}</DialogTitle></DialogHeader>
      {loading && <p className="text-muted-foreground">{fr ? "Chargement…" : "Loading…"}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {isWord && <div ref={wordRef} className="overflow-auto max-h-[65dvh]" />}
      {url && !isWord && !legacyWord && <PdfDocumentView url={url} />}
      {url && legacyWord && <p>{fr ? "Le format Word ancien (.doc) nécessite un téléchargement. Utilisez PDF ou DOCX pour l’aperçu." : "Legacy Word (.doc) requires downloading. Use PDF or DOCX for on-screen preview."}</p>}
      {url && <Button asChild variant="outline" className="justify-self-start"><a href={url} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 mr-2" />{fr ? "Ouvrir / télécharger" : "Open / download"}</a></Button>}
    </DialogContent>
  </Dialog>;
}
