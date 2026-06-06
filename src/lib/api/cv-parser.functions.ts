import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Parses a CV file (PDF / DOC / DOCX / image) using Lovable AI multimodal models
// and returns structured candidate fields. The browser uploads to Supabase
// Storage first, then calls this with the storage path; we fetch a signed URL
// server-side, download bytes, base64-encode and ship to Gemini.

const InputSchema = z.object({
  storage_path: z.string().min(1).max(500),
});

const CandidateSchema = z.object({
  full_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  years_experience: z.number().int().min(0).max(60).nullable().optional(),
  seniority: z.enum(["junior", "mid", "senior", "lead", "principal"]).nullable().optional(),
  skills: z.array(z.string().min(1).max(60)).max(40).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export type ParsedCandidate = z.infer<typeof CandidateSchema>;

const SYSTEM_PROMPT = `You are an assistant that extracts structured candidate data from a CV / resume document.
Return ONLY JSON matching this TypeScript type, with null for unknown fields:
{
  full_name: string|null,
  email: string|null,
  phone: string|null,
  headline: string|null,        // current title or short professional headline
  summary: string|null,         // 2-3 sentence professional summary
  location: string|null,
  linkedin_url: string|null,
  years_experience: number|null,
  seniority: "junior"|"mid"|"senior"|"lead"|"principal"|null,
  skills: string[],             // technical skills, max 30 short tokens
  tags: string[]                // industries / domains, max 10
}
Infer seniority from years and titles: <2y=junior, 2-5=mid, 5-9=senior, 9-13=lead, 13+=principal.
Do NOT invent data. Return strict JSON, no markdown.`;

export const parseCvFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(InputSchema)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    // Get signed URL for the uploaded CV (60s)
    const { data: signed, error: signErr } = await context.supabase.storage
      .from("cvs")
      .createSignedUrl(data.storage_path, 60);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Could not access CV file");

    // Download bytes
    const fileRes = await fetch(signed.signedUrl);
    if (!fileRes.ok) throw new Error("Failed to download CV file");
    const mime = fileRes.headers.get("content-type") ?? "application/pdf";
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) throw new Error("CV too large to parse (max 8 MB)");
    let base64 = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      base64 += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    base64 = btoa(base64);

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract candidate fields from this CV. Return only JSON." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up Lovable AI.");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`AI gateway error (${res.status}): ${text.slice(0, 200)}`);
    }

    const payload = await res.json();
    const content: string = payload?.choices?.[0]?.message?.content ?? "{}";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      // Try to salvage a JSON block
      const m = content.match(/\{[\s\S]*\}/);
      parsedJson = m ? JSON.parse(m[0]) : {};
    }
    const result = CandidateSchema.safeParse(parsedJson);
    if (!result.success) {
      return { candidate: {} as ParsedCandidate, warning: "AI returned an unexpected shape" };
    }
    return { candidate: result.data, warning: null as string | null };
  });
