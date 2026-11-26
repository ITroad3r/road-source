import { useEffect, useRef, useState } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
export function PdfDocumentView({ url }: { url: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError("");
    async function render() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const task = pdfjs.getDocument({ url });
        destroy = () => { void task.destroy(); };
        const pdf = await task.promise;
        if (!container.current || cancelled) return;
        container.current.replaceChildren();
        const width = Math.max(250, container.current.clientWidth - 16);
        for (let number = 1; number <= pdf.numPages; number++) {
          if (cancelled || !container.current) return;
          const page = await pdf.getPage(number);
          const original = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: width / original.width });
          const canvas = document.createElement("canvas");
          const ratio = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.className = "w-full h-auto border border-border mb-3";
          canvas.setAttribute("aria-label", `PDF page ${number}`);
          container.current.append(canvas);
          await page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] }).promise;
        }
      } catch (e) { if (!cancelled) setError((e as Error).message); }
    }
    void render();
    return () => { cancelled = true; destroy?.(); };
  }, [url]);
  return <div className="max-h-[65dvh] overflow-y-auto"><div ref={container} className="w-full" />{error && <p role="alert" className="text-destructive">{error}</p>}</div>;
}
