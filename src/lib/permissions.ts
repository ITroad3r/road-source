// Single source of truth for role -> capability mapping.
// Mirrors the database RLS policies; the database is the real enforcement.
export const APP_ROLES = ["sourceur", "hrbp", "operations", "ceo", "admin"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const CAPABILITIES = {
  "demands.viewAll": ["hrbp", "operations", "ceo"],
  "demands.manage": ["operations"], // create, edit, dispatch, delete
  "clients.view": ["sourceur", "hrbp", "operations", "ceo"],
  "clients.manage": ["operations"],
  "candidates.view": ["sourceur", "hrbp", "operations", "ceo"],
  "candidates.edit": ["sourceur", "hrbp", "operations"],
  "candidates.delete": ["operations"],
  "pipeline.qualify": ["hrbp", "operations"],
  "pipeline.finalDecision": ["operations"],
  "financials.view": ["operations", "ceo"],
  "financials.edit": ["operations"],
  "tjm.approve": ["operations"],
  "reports.view": ["hrbp", "operations", "ceo"],
  "users.manage": ["admin"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(roles: readonly string[] | undefined | null, cap: Capability): boolean {
  if (!roles) return false;
  const allowed = CAPABILITIES[cap] as readonly string[];
  return roles.some((r) => allowed.includes(r));
}

export function capabilitiesFor(roles: readonly string[]): Capability[] {
  return (Object.keys(CAPABILITIES) as Capability[]).filter((c) => can(roles, c));
}

export type PrimaryRole = AppRole | "none";
// Business dashboards take priority over admin: admin is technical only.
export function pickPrimaryRole(roles: readonly string[]): PrimaryRole {
  for (const r of ["operations", "ceo", "hrbp", "sourceur", "admin"] as const) {
    if (roles.includes(r)) return r;
  }
  return "none";
}
