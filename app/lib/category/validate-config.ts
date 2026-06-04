import type { CategoryPromptConfig, FacetConfig, FacetDefinition } from "./types";

const DEFAULT_STOP_WORDS = ["the", "and", "for", "with", "new", "sale", "shop"];
const MAX_TERMS_PER_FACET = 80;
const MAX_FACETS = 12;

function clampWeight(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 2;
  return Math.min(5, Math.max(1, Math.round(v)));
}

function normalizeFacetDefinition(raw: unknown): FacetDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = String(o.key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  if (!key) return null;
  const terms = Array.isArray(o.terms)
    ? [...new Set(o.terms.map((t) => String(t).trim().toLowerCase()).filter((t) => t.length > 1))].slice(
        0,
        MAX_TERMS_PER_FACET,
      )
    : [];
  return {
    key,
    label: String(o.label ?? key).trim() || key,
    terms,
    matchWeight: clampWeight(o.matchWeight),
    extractInKeyword: o.extractInKeyword !== false,
  };
}

export function normalizeFacetConfig(
  raw: unknown,
  fallback: { slug: string; name: string },
): FacetConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const productNoun = String(o.productNoun ?? fallback.slug)
    .trim()
    .toLowerCase()
    .replace(/s$/, "") || fallback.slug;

  let facets = Array.isArray(o.facets)
    ? o.facets.map(normalizeFacetDefinition).filter((f): f is FacetDefinition => f !== null)
    : [];

  if (facets.length === 0) {
    facets = [
      {
        key: "product_type",
        label: "Product type",
        terms: [fallback.slug, productNoun],
        matchWeight: 4,
        extractInKeyword: true,
      },
      {
        key: "attribute",
        label: "Attribute",
        terms: [],
        matchWeight: 2,
        extractInKeyword: true,
      },
      {
        key: "audience",
        label: "Audience",
        terms: ["beginners", "kids", "men", "women"],
        matchWeight: 1,
        extractInKeyword: true,
      },
    ];
  }

  facets = facets.slice(0, MAX_FACETS);

  const discoveryRaw = (o.discovery && typeof o.discovery === "object" ? o.discovery : {}) as Record<
    string,
    unknown
  >;

  const cannibalizationKeys = Array.isArray(o.cannibalizationKeys)
    ? o.cannibalizationKeys.map((k) => String(k).trim()).filter(Boolean)
    : facets.filter((f) => f.matchWeight >= 2).map((f) => f.key);

  return {
    version: 1,
    productNoun,
    facets,
    negativeSignals: Array.isArray(o.negativeSignals) ? (o.negativeSignals as FacetConfig["negativeSignals"]) : [],
    discovery: {
      stopWords: Array.isArray(discoveryRaw.stopWords)
        ? discoveryRaw.stopWords.map((w) => String(w).toLowerCase())
        : DEFAULT_STOP_WORDS,
      requireAnyTerms: Array.isArray(discoveryRaw.requireAnyTerms)
        ? discoveryRaw.requireAnyTerms.map((t) => String(t).toLowerCase())
        : [],
      appendProductNoun: discoveryRaw.appendProductNoun === true,
      productNoun: String(discoveryRaw.productNoun ?? productNoun),
    },
    cannibalizationKeys,
  };
}

export function normalizePromptConfig(
  raw: unknown,
  fallback: { name: string; facetKeys: string[] },
): CategoryPromptConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const facetPlaceholders = fallback.facetKeys.map((k) => `{${k}}`).join(", ");

  const defaultTemplate = `Create a product listing page (PLP) for ${fallback.name}.
TARGET KEYWORD: {keyword}
INTENT: {intent_json}
PRODUCTS: {products_json}
LOCALE: {locale_json}
BRAND TONE: {brand_tone}
RELATED PLPS: {related_plps_json}
Key attributes: ${facetPlaceholders || "see intent"}.
Return JSON with h1, intro, sections (min 3), faq (min 4), schema_markup, meta_title (max 60 chars), meta_description (CTR-focused), product_alt_texts keyed by product id, internal_links.`;

  let userPromptTemplate = String(o.userPromptTemplate ?? defaultTemplate).trim();
  if (!userPromptTemplate.includes("{keyword}")) {
    userPromptTemplate = defaultTemplate;
  }

  return {
    persona: String(o.persona ?? `You are an e-commerce and SEO expert for ${fallback.name}. Return ONLY valid JSON matching the output schema. No markdown. H1 must match the target keyword exactly. FAQ answers must be standalone.`).trim(),
    userPromptTemplate,
    temperature: Math.min(1, Math.max(0, Number(o.temperature ?? 0.5) || 0.5)),
  };
}
