import { describe, expect, it } from "vitest";
import { ALIGN_MAX_BYTES, alignCvInputSchema, validateAlignmentFile } from "./align-cv";

describe("Align CV document validation", () => {
  it("accepts source PDF and client specification PDF", () => {
    expect(alignCvInputSchema.safeParse({ candidate: { name: "virgin_cv.pdf", base64: "JVBERi0xLjQ=" }, specification: { name: "Fiche_de_post.pdf", base64: "JVBERi0xLjQ=" }, language: "fr", target_role: "Android" }).success).toBe(true);
  });
  it("requires both documents", () => {
    expect(alignCvInputSchema.safeParse({ candidate: { name: "cv.pdf", base64: "JVBERi0xLjQ=" }, language: "fr", target_role: "" }).success).toBe(false);
  });
  it("rejects non-PDF data even with a PDF filename", () => {
    expect(alignCvInputSchema.safeParse({ candidate: { name: "cv.pdf", base64: "aGVsbG8=" }, specification: { name: "job.pdf", base64: "JVBERi0xLjQ=" }, language: "en", target_role: "" }).success).toBe(false);
  });
  it("bounds each uploaded file at 10 MB and rejects empty or wrong types", () => {
    expect(validateAlignmentFile({ name: "cv.pdf", type: "application/pdf", size: ALIGN_MAX_BYTES })).toBe(true);
    expect(validateAlignmentFile({ name: "cv.pdf", type: "application/pdf", size: ALIGN_MAX_BYTES + 1 })).toBe(false);
    expect(validateAlignmentFile({ name: "cv.pdf", type: "application/pdf", size: 0 })).toBe(false);
    expect(validateAlignmentFile({ name: "cv.docx", type: "application/octet-stream", size: 100 })).toBe(false);
  });
});