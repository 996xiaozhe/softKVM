import type { AppLocale } from "../types";
import { en, resources, type TranslationKey } from "./resources";

export { localeOptions, type TranslationKey } from "./resources";

export function resolveLocale(locale: AppLocale = "system"): Exclude<AppLocale, "system"> {
  if (locale !== "system") return locale;
  const candidate = navigator.languages?.[0] || navigator.language || "en";
  const normalized = candidate.toLowerCase();
  if (["zh-tw", "zh-hk", "zh-mo"].includes(normalized)) return "zh-TW";
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("pt")) return "pt-BR";
  const short = candidate.split("-")[0] as Exclude<AppLocale, "system">;
  return short in resources ? short : "en";
}

export function createTranslator(locale: AppLocale = "system") {
  const resolved = resolveLocale(locale);
  return (key: TranslationKey, values: Record<string, string | number> = {}) => {
    let message = resources[resolved][key] || en[key];
    for (const [name, value] of Object.entries(values)) message = message.split(`{${name}}`).join(String(value));
    return message;
  };
}
