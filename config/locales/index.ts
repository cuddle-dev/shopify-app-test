import type { LocaleMarketConfig } from "../../app/lib/types";
import enUs from "./en-us/market.json";
import enAu from "./en-au/market.json";
import enGb from "./en-gb/market.json";
import frFr from "./fr-fr/market.json";
import frBe from "./fr-be/market.json";
import nlBe from "./nl-be/market.json";
import deDe from "./de-de/market.json";

const locales: Record<string, LocaleMarketConfig> = {
  "en-us": enUs as LocaleMarketConfig,
  "en-au": enAu as LocaleMarketConfig,
  "en-gb": enGb as LocaleMarketConfig,
  "fr-fr": frFr as LocaleMarketConfig,
  "fr-be": frBe as LocaleMarketConfig,
  "nl-be": nlBe as LocaleMarketConfig,
  "de-de": deDe as LocaleMarketConfig,
};

export function getLocaleConfig(localeId: string): LocaleMarketConfig {
  const config = locales[localeId];
  if (!config) {
    throw new Error(
      `Unknown locale "${localeId}". Add a folder under config/locales/ with market.json.`,
    );
  }
  return config;
}

export function listLocaleIds(): string[] {
  return Object.keys(locales);
}

export function getHreflangAlternates(
  localeIds: string[],
): Array<{ localeId: string; hreflang: string; urlPrefix: string }> {
  return localeIds.map((id) => {
    const c = getLocaleConfig(id);
    return { localeId: id, hreflang: c.hreflang, urlPrefix: c.urlPrefix };
  });
}

export default locales;
