export type CvExperience = {
  title: string;
  company: string;
  location: string;
  period: string;
  project?: string | null;
  bullets: string[];
};

export type CvEducation = {
  title: string;
  school: string;
  location: string;
  period: string;
  notes: string[];
};

export type CvData = {
  full_name: string;
  role_title: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  skill_groups: string[];
  experiences: CvExperience[];
  educations: CvEducation[];
  others: string[];
};

export const BRAND = {
  primary: "#1AA0D6",
  primaryDark: "#0F6E94",
  ink: "#111827",
  muted: "#6B7280",
  rule: "#1AA0D6",
};

export function anonymizeName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const rest = parts.slice(1).map((p) => p[0].toUpperCase() + ".").join(" ");
  return `${first} ${rest}`;
}
