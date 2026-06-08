import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, BorderStyle, LevelFormat,
  TabStopType, TabStopPosition, PageOrientation,
} from "docx";
import type { CvData } from "./types";
import { anonymizeName } from "./types";

const BLUE = "1AA0D6";
const DARK_BLUE = "0F6E94";
const INK = "111827";
const MUTED = "6B7280";

function sectionTitle(text: string) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { color: BLUE, size: 8, style: BorderStyle.SINGLE, space: 1 } },
    children: [new TextRun({ text, bold: true, size: 24, color: BLUE })],
  });
}

function bullet(text: string) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 19, color: INK })],
  });
}

function expHeader(title: string, company: string, location: string, period: string) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    spacing: { before: 140, after: 40 },
    children: [
      new TextRun({ text: title, bold: true, size: 20, color: INK }),
      ...(company ? [new TextRun({ text: "   " }), new TextRun({ text: company, bold: true, size: 20, color: DARK_BLUE, underline: {} })] : []),
      new TextRun({ text: `\t${[location, period].filter(Boolean).join("  ")}`, italics: true, size: 18, color: INK }),
    ],
  });
}

function projectLine(project: string) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: "PROJECT: ", bold: true, size: 19, color: INK }),
      new TextRun({ text: project, italics: true, size: 19, color: INK }),
    ],
  });
}

export async function buildItroadDocx(cv: CvData, anonymize: boolean, logoBytes?: Uint8Array | null): Promise<Blob> {
  const displayName = (anonymize ? anonymizeName(cv.full_name || "Candidate") : (cv.full_name || "Candidate")).toUpperCase();
  const role = (cv.role_title || "").toUpperCase();
  const contactBits = anonymize
    ? [cv.location].filter(Boolean)
    : [cv.email, cv.phone, cv.location, cv.linkedin_url].filter(Boolean);

  const children: Paragraph[] = [];

  // Header with logo (left) + name (right via tab)
  const headerRuns: (TextRun | ImageRun)[] = [];
  if (logoBytes) {
    headerRuns.push(new ImageRun({
      type: "jpg",
      data: logoBytes,
      transformation: { width: 70, height: 70 },
      altText: { title: "ITROAD", description: "ITROAD Group logo", name: "itroad-logo" },
    }));
  } else {
    headerRuns.push(new TextRun({ text: "ITROAD", bold: true, color: BLUE, size: 32 }));
    headerRuns.push(new TextRun({ text: "  GROUP", color: MUTED, size: 20 }));
  }
  headerRuns.push(new TextRun({ text: `\t${displayName}`, bold: true, size: 36, color: INK }));
  children.push(new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    spacing: { after: 60 },
    children: headerRuns,
  }));
  if (role) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      children: [new TextRun({ text: role, size: 28, color: INK })],
    }));
  }
  if (contactBits.length > 0) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
      children: [new TextRun({ text: contactBits.join(" · "), size: 18, color: MUTED })],
    }));
  }

  if (cv.skill_groups.length > 0) {
    children.push(sectionTitle("Skills"));
    cv.skill_groups.forEach((s) => children.push(bullet(s)));
  }

  if (cv.experiences.length > 0) {
    children.push(sectionTitle("Experience"));
    cv.experiences.forEach((e) => {
      children.push(expHeader(e.title, e.company, e.location, e.period));
      if (e.project) children.push(projectLine(e.project));
      e.bullets.forEach((b) => children.push(bullet(b)));
    });
  }

  if (cv.educations.length > 0) {
    children.push(sectionTitle("Education"));
    cv.educations.forEach((e) => {
      children.push(expHeader(e.title, e.school, e.location, e.period));
      e.notes.forEach((n) => children.push(bullet(n)));
    });
  }

  if (cv.others.length > 0) {
    children.push(sectionTitle("Others"));
    cv.others.forEach((o) => children.push(bullet(o)));
  }

  const doc = new Document({
    creator: "ITROAD Consulting",
    styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
    numbering: {
      config: [{
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { run: { color: BLUE }, paragraph: { indent: { left: 360, hanging: 240 } } },
        }],
      }],
    },
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.PORTRAIT }, margin: { top: 720, right: 900, bottom: 720, left: 900 } } },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}
