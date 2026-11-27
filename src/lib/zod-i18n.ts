import { z } from "zod";
import { txNow } from "@/hooks/use-tx";

/** Default form-validation messages follow the current UI language at the moment they are shown. */
const bilingualErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") return { message: txNow("Required", "Obligatoire") };
      return { message: txNow("Invalid value", "Valeur invalide") };
    case z.ZodIssueCode.too_small:
      if (issue.type === "string") return { message: txNow(`Must be at least ${issue.minimum} characters`, `Au moins ${issue.minimum} caractères requis`) };
      return { message: txNow(`Must be at least ${issue.minimum}`, `Doit être au moins ${issue.minimum}`) };
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") return { message: txNow(`Must be at most ${issue.maximum} characters`, `${issue.maximum} caractères maximum`) };
      return { message: txNow(`Must be at most ${issue.maximum}`, `Doit être au plus ${issue.maximum}`) };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: txNow("Invalid email address", "Adresse e-mail invalide") };
      if (issue.validation === "url") return { message: txNow("Invalid URL", "URL invalide") };
      return { message: txNow("Invalid format", "Format invalide") };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: txNow("Invalid choice", "Choix invalide") };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(bilingualErrorMap);
