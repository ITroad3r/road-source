import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages, Check } from "lucide-react";

const LANGS = [
  { code: "en", labelKey: "common.english", short: "EN" },
  { code: "fr", labelKey: "common.french", short: "FR" },
] as const;

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? "en").slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2" aria-label={t("common.language")}>
          <Languages className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => i18n.changeLanguage(l.code)}>
            <span className="flex-1">{t(l.labelKey)}</span>
            {current === l.code && <Check className="h-4 w-4 ml-2 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
