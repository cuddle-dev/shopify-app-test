import type { ParsedIntent } from "../types";
import type { FacetConfig } from "./types";

/** Read facet value from new or legacy intent shape. */
export function getIntentFacet(intent: ParsedIntent, key: string): string | undefined {
  if (intent.facets?.[key]) return intent.facets[key];
  const legacy = intent as Record<string, string | undefined>;
  return legacy[key];
}

export function buildParsedIntent(params: {
  raw: string;
  categoryId: string;
  categorySlug: string;
  facets: Record<string, string>;
  tokens?: string[];
  locale_terms?: Record<string, string>;
}): ParsedIntent {
  const raw = params.raw.trim();
  const tokens = params.tokens ?? raw.toLowerCase().split(/\s+/).filter(Boolean);
  const facets = params.facets;

  return {
    raw,
    categoryId: params.categoryId,
    categorySlug: params.categorySlug,
    facets,
    tokens,
    locale_terms: params.locale_terms,
    color: facets.color,
    style: facets.style,
    attribute: facets.attribute,
    use_case: facets.use_case,
    room: facets.room,
    audience: facets.audience,
    material: facets.material,
    product_type: facets.product_type,
    concern: facets.concern,
    skin_type: facets.skin_type,
    finish: facets.finish,
  };
}

export function normalizeParsedIntent(data: unknown, fallbackCategory?: {
  id: string;
  slug: string;
}): ParsedIntent {
  const o = (data ?? {}) as Record<string, unknown>;
  const raw = String(o.raw ?? "");

  if (o.categoryId && o.facets && typeof o.facets === "object") {
    const facets = o.facets as Record<string, string>;
    return buildParsedIntent({
      raw,
      categoryId: String(o.categoryId),
      categorySlug: String(o.categorySlug ?? fallbackCategory?.slug ?? "generic"),
      facets,
      tokens: Array.isArray(o.tokens) ? (o.tokens as string[]) : undefined,
      locale_terms: o.locale_terms as Record<string, string> | undefined,
    });
  }

  const facets: Record<string, string> = {};
  for (const key of [
    "color",
    "style",
    "attribute",
    "use_case",
    "room",
    "audience",
    "material",
    "product_type",
    "concern",
    "skin_type",
    "finish",
  ]) {
    if (typeof o[key] === "string") facets[key] = o[key] as string;
  }

  return buildParsedIntent({
    raw,
    categoryId: fallbackCategory?.id ?? String(o.categoryId ?? ""),
    categorySlug: fallbackCategory?.slug ?? "generic",
    facets,
    tokens: Array.isArray(o.tokens) ? (o.tokens as string[]) : undefined,
    locale_terms: o.locale_terms as Record<string, string> | undefined,
  });
}

export function getCannibalizationKeys(facetConfig: FacetConfig): string[] {
  return facetConfig.cannibalizationKeys.length > 0
    ? facetConfig.cannibalizationKeys
    : facetConfig.facets.map((f) => f.key);
}
