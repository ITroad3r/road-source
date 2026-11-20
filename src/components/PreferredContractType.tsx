import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTRACT_TYPES, type ContractType } from "@/lib/compensation";

/** Candidate preference (Talent Hub). Separate from the per-candidature compensation proposal. */
export function PreferredContractSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: ContractType | "") => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("comp.preferred")}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : (v as ContractType))}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("comp.noPreference")}</SelectItem>
          {CONTRACT_TYPES.map((c) => <SelectItem key={c} value={c}>{t(`comp.types.${c}`)}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t("comp.preferredHint")}</p>
    </div>
  );
}

export function PreferredContractBadge({ value }: { value: ContractType | null | undefined }) {
  const { t } = useTranslation();
  if (!value) return null;
  return <Badge variant="outline" className="text-xs border-primary/40 text-primary">{t("comp.preferred")}: {t(`comp.types.${value}`)}</Badge>;
}

export function PreferredContractText({ value }: { value: ContractType | null | undefined }) {
  const { t } = useTranslation();
  return <span className="text-sm">{value ? t(`comp.types.${value}`) : t("comp.noPreference")}</span>;
}

export function PreferredContractView({ value }: { value: ContractType | null | undefined }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{t("comp.preferred")}</div>
      <PreferredContractText value={value} />
    </div>
  );
}
