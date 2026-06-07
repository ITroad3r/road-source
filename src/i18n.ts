import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en/common.json";
import fr from "./locales/fr/common.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      fr: { common: fr },
    },
    fallbackLng: "en",
    defaultNS: "common",
    supportedLngs: ["en", "fr"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: "roadsource-lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
