import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en/common.json";
import fr from "./locales/fr/common.json";

export const LANG_COOKIE = "roadsource-lang";
export type AppLang = "en" | "fr";
export const normalizeLang = (v: string | null | undefined): AppLang => (v ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";

const isBrowser = typeof window !== "undefined";

const instance = i18n.use(initReactI18next);
if (isBrowser) instance.use(LanguageDetector);

void instance.init({
  resources: {
    en: { common: en },
    fr: { common: fr },
  },
  lng: isBrowser ? undefined : "en",
  fallbackLng: "en",
  defaultNS: "common",
  supportedLngs: ["en", "fr"],
  interpolation: { escapeValue: false },
  initAsync: false,
  react: { useSuspense: false },
  detection: {
    // Cookie first so the server renders the same language the browser will use (no English flash).
    order: ["cookie", "localStorage", "navigator", "htmlTag"],
    lookupCookie: LANG_COOKIE,
    lookupLocalStorage: "roadsource-lang",
    caches: ["localStorage", "cookie"],
    cookieMinutes: 60 * 24 * 365,
    cookieOptions: { path: "/", sameSite: "lax" },
  },
});

export default i18n;
