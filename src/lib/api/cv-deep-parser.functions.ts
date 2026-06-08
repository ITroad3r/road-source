import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  storage_path: z.string().min(1).max(500),
});

const ExperienceSchema = z.object({
  title: z.string().default(""),
  company: z.string().default(""),
  location: z.string().default(""),
  period: z.string().default(""),
  project: z.string().nullable().optional(),
  bullets: z.array(z.string()).default([]),
});

const EducationSchema = z.object({
  title: z.string().default(""),
  school: z.string().default(""),
  location: z.string().default(""),
  period: z.string().default(""),
  notes: z.array(z.string()).default([]),
});

const FullCvSchema = z.object({
  full_name: z.string().default(""),
  role_title: z.string().default(""),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  skill_groups: z.array(z.string()).default([]),
  experiences: z.array(ExperienceSchema).default([]),
  educations: z.array(EducationSchema).default([]),
  others: z.array(z.string()).default([]),
});

export type DeepCvData = z.infer<typeof FullCvSchema>;

const SYSTEM_PROMPT = `You extract structured CV data and return STRICT JSON.
Output schema:
{
  "full_name": string,
  "role_title": string,            // current/target professional title in UPPERCASE (e.g. "DEVELOPPEUR JAVA")
  "email": string|null,
  "phone": string|null,
  "location": string|null,
  "linkedin_url": string|null,
  "skill_groups": string[],        // 3-6 lines, each grouping related skills separated by " | "
                                   //   e.g. "Java | Spring boot | Hibernate | JUnit"
                                   //        "JavaScript | TypeScript | Angular | RxJs"
                                   //        "English, French, Arabic - Native or bilingual"
  "experiences": [{
    "title": string,               // role title
    "company": string,              // company name (UPPERCASE preferred)
    "location": string,             // city, country
    "period": string,               // "MM/YYYY-MM/YYYY" or "MM/YYYY-Present"
    "project": string|null,         // brief project description if mentioned, else null
    "bullets": string[]             // 3-6 short achievement bullets
  }],
  "educations": [{
    "title": string,                // degree
    "school": string,                // institution (UPPERCASE preferred)
    "location": string,
    "period": string,
    "notes": string[]
  }],
  "others": string[]                // certifications, side projects, awards
}
Rules:
- Never invent data. Leave empty strings or null when unknown.
- Group skills logically (backend / frontend / databases / devops / languages).
- Keep bullets concise and action-oriented.
- Return ONLY JSON, no markdown fences.`;

export const parseFullCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(InputSchema)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    const { data: signed, error: signErr } = await context.supabase.storage
      .from("cvs")
      .createSignedUrl(data.storage_path, 60);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Could not access CV file");

    const fileRes = await fetch(signed.signedUrl);
    if (!fileRes.ok) throw new Error("Failed to download CV file");
    const mime = fileRes.headers.get("content-type") ?? "application/pdf";
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    if (bytes.length > 10 * 1024 * 1024) throw new Error("CV too large (max 10 MB)");
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
            { type: "text", text: "Extract the full structured CV. Return only the JSON object." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (res.status === 429) throw new Error("Rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Top up Lovable AI.");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`AI gateway error (${res.status}): ${text.slice(0, 200)}`);
    }
    const payload = await res.json();
    const content: string = payload?.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    const result = FullCvSchema.safeParse(parsed);
    return { cv: result.success ? result.data : ({} as DeepCvData) };
  });
