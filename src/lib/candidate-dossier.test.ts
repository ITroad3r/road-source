import { describe, it, expect } from "vitest";
import { scoreSchema, validTestPdf, clearedSection, dossierSchema } from "./candidate-dossier";
describe("candidate contact and screening rules", () => {
  it("technical and psychological test scores are percentages from 0 through 100", () => {
    for (const value of [0, 57.5, 100, null]) expect(scoreSchema.safeParse(value).success).toBe(true);
    for (const value of [-1, 100.01, Infinity, NaN]) expect(scoreSchema.safeParse(value).success).toBe(false);
  });
  it("test attachments accept PDFs only up to 10 MB", () => {
    expect(validTestPdf({type:"application/pdf",size:10*1024*1024})).toBe(true);
    expect(validTestPdf({type:"application/pdf",size:10*1024*1024+1})).toBe(false);
    expect(validTestPdf({type:"application/msword",size:100})).toBe(false);
  });
  it("contact accepts phone, video and WhatsApp communication", () => {
    const base = { employment_status:"employed",technical_score:null,psychological_score:null,current_pay:0 };
    for (const method of ["phone","visio","whatsapp"]) expect(dossierSchema.safeParse({...base,communication_method:method}).success).toBe(true);
    expect(dossierSchema.safeParse({...base,communication_method:"email"}).success).toBe(false);
  });
  it("employment can be employed or unemployed, with non-negative current salary or TJM", () => {
    const base = {communication_method:null,technical_score:null,psychological_score:null,current_pay:1500};
    for (const status of ["employed","unemployed"]) expect(dossierSchema.safeParse({...base,employment_status:status}).success).toBe(true);
    expect(dossierSchema.safeParse({...base,employment_status:"employed",current_pay:-1}).success).toBe(false);
  });
  it("deleting contact information preserves screening scores and PDFs", () => {
    const combined = {...{technical_score:85,technical_pdf:"test.pdf",contact_observations:"Call"},...clearedSection("contact")};
    expect(combined.contact_observations).toBeNull();
    expect(combined.technical_score).toBe(85);
    expect(combined.technical_pdf).toBe("test.pdf");
  });
  it("deleting screening removes both scores and PDFs without deleting contact information", () => {
    const combined = {...{country:"Morocco",technical_pdf:"test.pdf",technical_score:85},...clearedSection("screening")};
    expect(combined.country).toBe("Morocco");
    expect(combined.technical_score).toBeNull();
    expect(combined.technical_pdf).toBeNull();
  });
});
