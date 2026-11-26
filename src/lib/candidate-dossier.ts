import { z } from "zod";
export const scoreSchema = z.number().finite().min(0).max(100).nullable();
export const dossierSchema = z.object({
  communication_method: z.enum(["phone", "visio", "whatsapp"]).nullable(),
  employment_status: z.enum(["employed", "unemployed"]).nullable(),
  technical_score: scoreSchema, psychological_score: scoreSchema,
  current_pay: z.number().finite().min(0).nullable(),
});
export function validTestPdf(file: Pick<File, "type" | "size">): boolean {
  return file.type === "application/pdf" && file.size <= 10 * 1024 * 1024;
}
export const CONTACT_FIELDS = ["communication_method", "communicated_at", "employment_status", "availability_notes", "expected_joining_date", "current_contract_type", "current_pay", "current_pay_type", "currency", "country", "city", "contact_observations"] as const;
export const SCREENING_FIELDS = ["technical_score", "psychological_score", "technical_pdf", "psychological_pdf", "screening_observations"] as const;
export function clearedSection(section: "contact" | "screening") {
  return Object.fromEntries((section === "contact" ? CONTACT_FIELDS : SCREENING_FIELDS).map(key => [key, key === "currency" ? "MAD" : null]));
}
