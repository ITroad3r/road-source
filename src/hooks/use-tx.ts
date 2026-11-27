import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

/**
 * Inline bilingual text: tx("Save", "Enregistrer").
 * Used for screen copy that lives next to its markup; shared/reused strings stay in locales/*.
 */
export function useTx() {
  const { i18n } = useTranslation();
  const fr = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("fr");
  const tx = (en: string, frText: string) => (fr ? frText : en);
  return { tx, isFr: fr, locale: fr ? "fr-FR" : "en-GB" };
}

/** Non-hook variant for module-level label maps (read at render time via getters). */
export function txNow(en: string, frText: string) {
  return (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("fr") ? frText : en;
}
