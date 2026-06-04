import { completeJson } from "../llm";
import type { ParsedIntent } from "../types";
import { getLocaleConfig } from "../../../config/locales";
import { extractFacetsFromKeyword, scoreCategoryForKeyword } from "../category/facets";
import { buildParsedIntent } from "../category/intent";
import { listActiveCategories, getCategoryById } from "../category/seed";
import type { ShopCategoryRecord } from "../category/types";

export type ParseKeywordOptions = {
  shop: string;
  categoryId?: string | null;
};

/**
 * Hybrid intent parsing: pick category, extract facets from config, LLM enrichment when gaps.
 */
export async function parseKeywordIntent(
  keyword: string,
  localeId: string,
  options: ParseKeywordOptions,
): Promise<ParsedIntent> {
  const categories = await listActiveCategories(options.shop);
  const locale = getLocaleConfig(localeId);

  let category: ShopCategoryRecord | null = null;

  if (options.categoryId) {
    category = (await getCategoryById(options.shop, options.categoryId)) ?? null;
  }

  if (!category) {
    category = pickCategoryForKeyword(keyword, categories);
  }

  const facets = extractFacetsFromKeyword(keyword, category.facetConfig);
  let intent = buildParsedIntent({
    raw: keyword,
    categoryId: category.id,
    categorySlug: category.slug,
    facets,
    tokens: keyword.trim().toLowerCase().split(/\s+/).filter(Boolean),
  });

  const needsAi = shouldEnrichWithLlm(intent, category);

  if (needsAi) {
    try {
      const enriched = await completeJson(
        [
          {
            role: "system",
            content: `Extract structured shopping intent for category "${category.name}" (${category.slug}). Return JSON only with keys matching these facets: ${category.facetConfig.facets.map((f) => f.key).join(", ")}. Also include categorySlug if confident. Omit nulls.`,
          },
          {
            role: "user",
            content: `Keyword: "${keyword}"\nMarket: ${locale.id} (${locale.language}-${locale.region})`,
          },
        ],
        { temperature: 0.2, maxTokens: 512 },
      );
      const parsed = JSON.parse(enriched) as Record<string, string | undefined>;
      const mergedFacets = { ...intent.facets };
      for (const facet of category.facetConfig.facets) {
        if (parsed[facet.key]) mergedFacets[facet.key] = parsed[facet.key]!.toLowerCase();
      }
      intent = buildParsedIntent({
        raw: keyword,
        categoryId: category.id,
        categorySlug: category.slug,
        facets: mergedFacets,
        tokens: intent.tokens,
      });
    } catch {
      // keep rule-based intent
    }
  }

  return applyLocaleTerms(intent, locale.terminology);
}

function pickCategoryForKeyword(
  keyword: string,
  categories: ShopCategoryRecord[],
): ShopCategoryRecord {
  if (categories.length === 0) {
    throw new Error("No categories configured. Run Catalog analysis on the Categories page first.");
  }

  let best = categories[0];
  let bestScore = -1;

  for (const cat of categories) {
    const score = scoreCategoryForKeyword(keyword, cat.facetConfig);
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  if (bestScore <= 0) {
    const generic = categories.find((c) => c.slug === "generic");
    return generic ?? best;
  }

  return best;
}

function shouldEnrichWithLlm(intent: ParsedIntent, category: ShopCategoryRecord): boolean {
  const filled = category.facetConfig.facets.filter((f) => intent.facets[f.key]).length;
  if (filled >= 2) return false;
  if (intent.tokens.length <= 4) return false;
  return true;
}

function applyLocaleTerms(
  intent: ParsedIntent,
  terminology: Record<string, string>,
): ParsedIntent {
  const locale_terms: Record<string, string> = { ...intent.locale_terms };
  const room = intent.facets.room;
  if (room && terminology.living_room) {
    const key = room.replace(/\s/g, "_");
    locale_terms.room = terminology[key] ?? room;
  }
  return { ...intent, locale_terms };
}
