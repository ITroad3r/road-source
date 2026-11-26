import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ALIGN_CV_PROMPT, alignmentResultSchema, alignCvInputSchema } from "./align-cv";
import type { z } from "zod";

// Provider boundary: replace this adapter when moving away from managed Lovable AI.
export async function generateAlignedCv(data: z.infer<typeof alignCvInputSchema>) {
  try {
    const response = await generateResponse({
      model: "openai/gpt-6.1-sol",
      instructions: ALIGN_CV_PROMPT,
      input: [{ role: "user", content: [
        { type: "input_text", text: `Output language: ${data.language}. Target role: ${data.target_role || "Select the role evidenced by the source CV"}. First document: candidate CV. Second document: client specification.` },
        { type: "input_file", filename: data.candidate.name, file_data: `data:application/pdf;base64,${data.candidate.base64}` },
        { type: "input_file", filename: data.specification.name, file_data: `data:application/pdf;base64,${data.specification.base64}` },
      ] }],
      text: { format: { type: "json_schema", name: "aligned_cv", strict: true, schema: zodToJsonSchema(alignmentResultSchema, { $refStrategy: "none" }) } },
    });
    const messages = response.output.filter((item) => item.type === "message");
    if (messages.some((item) => item.content.some((part) => part.type === "refusal"))) {
      return { ok: false as const, error: "refused" as const };
    }
    if (response.status !== "completed") return { ok: false as const, error: "incomplete" as const };
    const output = messages.flatMap((item) => item.content.flatMap((part) => part.type === "output_text" ? [part.text] : [])).join("");
    const result = alignmentResultSchema.safeParse(JSON.parse(output));
    if (!result.success) return { ok: false as const, error: "invalid" as const };
    return { ok: true as const, result: result.data };
  } catch (error) {
    if (error instanceof GatewayError) {
      console.error("Align CV gateway failure", { code: error.code, outcome: error.outcome, ids: error.ids });
      if (error.code === "payment_required") return { ok: false as const, error: "credits" as const };
      if (error.code === "rate_limited") return { ok: false as const, error: "rate" as const };
      if (error.code === "permission_denied") return { ok: false as const, error: "access" as const };
      if (error.outcome === "unknown") return { ok: false as const, error: "unknown" as const };
    }
    return { ok: false as const, error: "failed" as const };
  }
}