import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { CvData } from "./types";
import { BRAND, anonymizeName } from "./types";

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 36, paddingHorizontal: 40, fontSize: 9.5, fontFamily: "Helvetica", color: BRAND.ink, lineHeight: 1.35 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 8 },
  brand: { flexDirection: "column" },
  brandLine1: { color: BRAND.primary, fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 2 },
  brandLine2: { color: BRAND.muted, fontSize: 8, letterSpacing: 4, marginTop: 1 },
  headerRight: { flexDirection: "column", alignItems: "flex-end", maxWidth: "65%" },
  name: { fontFamily: "Helvetica-Bold", fontSize: 20, color: BRAND.ink, textAlign: "right" },
  role: { fontFamily: "Helvetica", fontSize: 14, color: BRAND.ink, textAlign: "right", marginTop: 2 },
  contact: { fontSize: 8.5, color: BRAND.muted, marginTop: 4, textAlign: "right" },
  sectionTitle: { color: BRAND.primary, fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 10, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: BRAND.rule, paddingBottom: 2 },
  bulletRow: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 10, color: BRAND.primary, fontFamily: "Helvetica-Bold" },
  bulletText: { flex: 1 },
  expHeader: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, marginBottom: 2 },
  expLeft: { flexDirection: "row", flexWrap: "wrap", flex: 1 },
  expTitle: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  expCompany: { fontFamily: "Helvetica-Bold", fontSize: 10, color: BRAND.primaryDark, marginLeft: 8, textDecoration: "underline" },
  expMeta: { fontFamily: "Helvetica-Oblique", fontSize: 9, color: BRAND.ink, textAlign: "right" },
  project: { fontSize: 9.5, marginTop: 1, marginBottom: 3, fontStyle: "italic" },
  projectLabel: { fontFamily: "Helvetica-Bold" },
});

export function ItroadCvPdf({ cv, anonymize, logoUrl }: { cv: CvData; anonymize: boolean; logoUrl?: string | null }) {
  const displayName = anonymize ? anonymizeName(cv.full_name || "Candidate") : (cv.full_name || "Candidate");
  const contactBits = anonymize
    ? [cv.location].filter(Boolean)
    : [cv.email, cv.phone, cv.location, cv.linkedin_url].filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.brand}>
            <Text style={styles.brandLine1}>ITROAD</Text>
            <Text style={styles.brandLine2}>CONSULTING</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.name}>{displayName.toUpperCase()}</Text>
            {cv.role_title ? <Text style={styles.role}>{cv.role_title.toUpperCase()}</Text> : null}
            {contactBits.length > 0 ? <Text style={styles.contact}>{contactBits.join(" · ")}</Text> : null}
          </View>
        </View>

        {cv.skill_groups.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Skills</Text>
            {cv.skill_groups.map((line, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>
        )}

        {cv.experiences.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Experience</Text>
            {cv.experiences.map((e, i) => (
              <View key={i} wrap={false}>
                <View style={styles.expHeader}>
                  <View style={styles.expLeft}>
                    <Text style={styles.expTitle}>{e.title}</Text>
                    {e.company ? <Text style={styles.expCompany}>{e.company}</Text> : null}
                  </View>
                  <Text style={styles.expMeta}>{[e.location, e.period].filter(Boolean).join("  ")}</Text>
                </View>
                {e.project ? (
                  <Text style={styles.project}>
                    <Text style={styles.projectLabel}>PROJECT: </Text>
                    {e.project}
                  </Text>
                ) : null}
                {e.bullets.map((b, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {cv.educations.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Education</Text>
            {cv.educations.map((e, i) => (
              <View key={i} wrap={false}>
                <View style={styles.expHeader}>
                  <View style={styles.expLeft}>
                    <Text style={styles.expTitle}>{e.title}</Text>
                    {e.school ? <Text style={styles.expCompany}>{e.school}</Text> : null}
                  </View>
                  <Text style={styles.expMeta}>{[e.location, e.period].filter(Boolean).join("  ")}</Text>
                </View>
                {e.notes.map((n, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{n}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {cv.others.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Others</Text>
            {cv.others.map((o, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{o}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
