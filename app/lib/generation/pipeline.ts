import { getLocaleConfig } from "../../../config/locales";
import { getPageTypeConfig } from "../../../config/page-types";
import { completeJson } from "../llm";
import type {
  GeneratedPlpContent,
  MatchedProduct,
  PageTypeConfig,
  ParsedIntent,
} from "../types";
import { validateGeneratedContent } from "./validator";

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

export type GenerationInput = {
  keyword: string;
  intent: ParsedIntent;
  products: MatchedProduct[];
  localeId: string;
  pageTypeId: string;
  brandTone: string;
  relatedPlps?: Array<{ slug: string; keyword: string; localeId: string }>;
};

const MAX_RETRIES = 3;

export async function generatePlpContent(
  input: GenerationInput,
): Promise<{ content: GeneratedPlpContent; pageType: PageTypeConfig }> {
  const pageType = getPageTypeConfig(input.pageTypeId);
  const locale = getLocaleConfig(input.localeId);

  const vars: Record<string, string> = {
    style: input.intent.style ?? "",
    room: input.intent.room ?? input.intent.use_case ?? "",
    use_case: input.intent.use_case ?? "",
    attribute: input.intent.attribute ?? "",
    keyword: input.keyword,
    brand: "Store",
    product_count: String(input.products.length),
    currency: locale.currency,
    market: `${locale.language}-${locale.region}`,
    brand_tone: input.brandTone,
    intent_json: JSON.stringify(input.intent),
    products_json: JSON.stringify(input.products.slice(0, 12)),
    locale_json: JSON.stringify(locale),
    related_plps_json: JSON.stringify(input.relatedPlps ?? []),
  };

  const userPrompt = fillTemplate(pageType.generation.user_prompt_template, vars);

  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const raw = await completeJson(
      [
        { role: "system", content: pageType.generation.system_prompt },
        {
          role: "user",
          content:
            attempt === 0
              ? userPrompt
              : `${userPrompt}\n\nPrevious response invalid: ${lastErrors.join("; ")}. Fix and return valid JSON only.`,
        },
      ],
      { temperature: pageType.generation.temperature },
    );

    const result = validateGeneratedContent(raw, pageType);
    if (result.valid && result.data) {
      return { content: result.data, pageType };
    }
    lastErrors = result.errors ?? ["unknown validation error"];
  }

  throw new Error(`AI output failed validation after ${MAX_RETRIES} retries: ${lastErrors.join("; ")}`);
}
