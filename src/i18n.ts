import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en/common.json";
import fr from "./locales/fr/common.json";

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
  initImmediate: false,
  react: { useSuspense: false },
  detection: {
    order: ["localStorage", "navigator", "htmlTag"],
    lookupLocalStorage: "roadsource-lang",
    caches: ["localStorage"],
  },
});

export default i18n;
