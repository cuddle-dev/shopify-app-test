import { completeJson } from "../llm";
import type { ParsedIntent } from "../types";
import { getLocaleConfig } from "../../../config/locales";
import { parseIntentRules } from "./rules";

/**
 * Hybrid intent parsing: rules first (fast, deterministic), LLM enrichment
 * when rules leave gaps or keyword is complex.
 */
export async function parseKeywordIntent(
  keyword: string,
  localeId: string,
): Promise<ParsedIntent> {
  const base = parseIntentRules(keyword);
  const locale = getLocaleConfig(localeId);

  const needsAi =
    !base.style &&
    !base.room &&
    !base.use_case &&
    !base.attribute &&
    base.tokens.length > 4;

  if (!needsAi) {
    return applyLocaleTerms(base, locale.terminology);
  }

  try {
    const enriched = await completeJson(
      [
        {
          role: "system",
          content:
            "Extract structured shopping intent from wallpaper/interior keywords. Return JSON only with keys: color, style, attribute, use_case, room, audience, material. Omit nulls.",
        },
        {
          role: "user",
          content: `Keyword: "${keyword}"\nMarket: ${locale.id} (${locale.language}-${locale.region})`,
        },
      ],
      { temperature: 0.2, maxTokens: 512 },
    );
    const parsed = JSON.parse(enriched) as Partial<ParsedIntent>;
    return applyLocaleTerms(
      {
        ...base,
        color: parsed.color ?? base.color,
        style: parsed.style ?? base.style,
        attribute: parsed.attribute ?? base.attribute,
        use_case: parsed.use_case ?? base.use_case,
        room: parsed.room ?? base.room,
        audience: parsed.audience ?? base.audience,
        material: parsed.material ?? base.material,
      },
      locale.terminology,
    );
  } catch {
    return applyLocaleTerms(base, locale.terminology);
  }
}

function applyLocaleTerms(
  intent: ParsedIntent,
  terminology: Record<string, string>,
): ParsedIntent {
  const locale_terms: Record<string, string> = {};
  if (intent.room && terminology.living_room) {
    locale_terms.room = terminology[intent.room.replace(/\s/g, "_")] ?? intent.room;
  }
  return { ...intent, locale_terms };
}
