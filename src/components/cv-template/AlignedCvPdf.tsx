import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { AlignedCv } from "@/lib/align-cv";
import groupLogo from "@/assets/itroad-group.png.asset.json";

export type CvPalette = { header: string; accent: string; paper: string; sidebar: string; panel: string; ink: string; muted: string };
export function readCvPalette(): CvPalette {
  const css = getComputedStyle(document.documentElement);
  const read = (key: string) => css.getPropertyValue(`--cv-${key}`).trim();
  return { header: read("header"), accent: read("accent"), paper: read("paper"), sidebar: read("sidebar"), panel: read("panel"), ink: read("ink"), muted: read("muted") };
}

type Block = { text: string; kind: "heading" | "title" | "company" | "meta" | "body" | "bullet" | "environment" };
// Conservative line estimates split long content into pages; blocks remain individually wrappable.
function paginate(blocks: Block[], width: number, height: number) {
  const pages: Block[][] = [[]];
  let used = 0;
  for (const [index, block] of blocks.entries()) {
    const size = block.kind === "heading" ? 12 : 9.2;
    const lines = block.text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (width / (size * 0.52)))), 0);
    const needed = lines * size * 1.35 + (block.kind === "heading" ? 21 : 5);
    const keepWithNext = block.kind === "heading" ? 70 : block.kind === "title" ? 60 : 0;
    if (used + needed + keepWithNext > height && (pages.at(-1)?.length ?? 0) > 0 && index > 0) { pages.push([]); used = 0; }
    pages.at(-1)?.push(block);
    used += needed;
  }
  return pages;
}

export function AlignedCvPdf({ cv, palette: c, language, anonymous, branded }: {
  cv: AlignedCv; palette: CvPalette; language: "fr" | "en"; anonymous: boolean; branded: boolean;
}) {
  const fr = language === "fr";
  const headings = fr ? ["Formation", "Compétences", "Langues", "Profil", "Expériences Professionnelles", "Projets Réalisés", "Environnement"] : ["Education", "Skills", "Languages", "Profile", "Professional Experience", "Projects", "Environment"];
  const side: Block[] = [];
  if (cv.educations.length) side.push({ kind: "heading", text: headings[0] ?? "" });
  cv.educations.forEach((e) => side.push({ kind: "title", text: e.school }, { kind: "meta", text: [e.period, e.location].filter(Boolean).join(" · ") }, { kind: "body", text: e.title }));
  if (cv.skill_groups.length) side.push({ kind: "heading", text: headings[1] ?? "" });
  cv.skill_groups.forEach((text) => side.push({ kind: "body", text }));
  if (cv.languages.length) side.push({ kind: "heading", text: headings[2] ?? "" });
  cv.languages.forEach((text) => side.push({ kind: "body", text }));
  const main: Block[] = [{ kind: "heading", text: headings[3] ?? "" }, { kind: "body", text: cv.profile }];
  if (cv.experiences.length) main.push({ kind: "heading", text: headings[4] ?? "" });
  cv.experiences.forEach((e) => {
    main.push({ kind: "title", text: e.title }, { kind: "company", text: e.company }, { kind: "meta", text: e.period });
    if (e.description) main.push({ kind: "body", text: e.description });
    e.bullets.filter(Boolean).forEach((text) => main.push({ kind: "bullet", text }));
    if (e.environment) main.push({ kind: "environment", text: `${headings[6]} : ${e.environment}` });
  });
  if (cv.projects.length) main.push({ kind: "heading", text: headings[5] ?? "" });
  cv.projects.forEach((p) => {
    main.push({ kind: "title", text: p.name }, { kind: "body", text: p.description });
    if (p.technologies) main.push({ kind: "meta", text: p.technologies });
  });
  const sidePages = paginate(side, 156, 680);
  const mainPages = paginate(main, 368, 680);
  const styles = StyleSheet.create({
    page: { backgroundColor: c.paper, color: c.ink, fontFamily: "Helvetica", fontSize: 9.2, lineHeight: 1.35, paddingBottom: 30 },
    header: { height: 82, backgroundColor: c.header, paddingHorizontal: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    identity: { width: 390 }, name: { color: c.paper, fontSize: 20, fontFamily: "Helvetica-Bold", lineHeight: 1.4, marginBottom: 8 }, role: { color: c.paper, fontSize: 12, lineHeight: 1.4 }, logo: { width: 96, height: 65, objectFit: "contain" },
    columns: { flexDirection: "row", alignItems: "flex-start" },
    sidebar: { width: 190, padding: 15, minHeight: 710, backgroundColor: c.sidebar },
    main: { width: 405, padding: 15 },
    heading: { color: c.header, fontFamily: "Helvetica-Bold", fontSize: 12, borderBottomWidth: 1.4, borderBottomColor: c.accent, paddingBottom: 4, marginTop: 9, marginBottom: 7 },
    title: { fontFamily: "Helvetica-Bold", color: c.header, marginTop: 5, marginBottom: 3, fontSize: 10 },
    company: { fontFamily: "Helvetica-Bold", color: c.accent, marginBottom: 2 },
    meta: { fontFamily: "Helvetica-Oblique", color: c.muted, fontSize: 8.2, marginBottom: 4 },
    body: { marginBottom: 4 }, bullet: { flexDirection: "row", marginBottom: 4 }, dot: { width: 10, color: c.accent }, bulletText: { flex: 1 },
    environment: { backgroundColor: c.panel, borderLeftWidth: 2, borderLeftColor: c.accent, padding: 5, color: c.muted, fontSize: 8.2, marginVertical: 5 },
    footer: { position: "absolute", bottom: 12, right: 20, fontSize: 7, color: c.muted },
  });
  const render = (blocks: Block[]) => blocks.filter((b) => b.text).map((b, i) => b.kind === "bullet"
    ? <View key={i} style={styles.bullet}><Text style={styles.dot}>•</Text><Text style={styles.bulletText}>{b.text}</Text></View>
    : <Text key={i} style={styles[b.kind]}>{b.text}</Text>);
  return <Document title={anonymous ? "Candidate CV" : `${cv.full_name} — ${cv.role_title}`} author={branded ? "ITROAD GROUP" : ""}>
    {Array.from({ length: Math.max(mainPages.length, sidePages.length) }, (_, i) => <Page key={i} size="A4" style={styles.page}>
      <View style={styles.header}><View style={styles.identity}><Text style={styles.name}>{anonymous ? (fr ? "Profil candidat" : "Candidate profile") : cv.full_name}</Text><Text style={styles.role}>{cv.role_title}</Text></View>{branded ? <Image src={groupLogo.url} style={styles.logo} /> : null}</View>
      <View style={styles.columns}><View style={styles.sidebar}>{render(sidePages[i] ?? [])}</View><View style={styles.main}>{render(mainPages[i] ?? [])}</View></View>
      <Text style={styles.footer}>{i + 1} / {Math.max(mainPages.length, sidePages.length)}</Text>
    </Page>)}
  </Document>;
}