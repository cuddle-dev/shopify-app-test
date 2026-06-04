import { completeJson } from "../llm";
import type { CatalogProduct } from "../types";
import { serializeFacetConfig, serializePromptConfig } from "./config";
import type { CategoryPromptConfig, FacetConfig } from "./types";
import { normalizeFacetConfig, normalizePromptConfig } from "./validate-config";
import { assignProductsToCategory } from "./products";
import prisma from "../../db.server";

export type ProposedCategory = {
  slug: string;
  name: string;
  confidence: number;
  signals: string[];
  facetConfig: FacetConfig;
  promptConfig: CategoryPromptConfig;
};

export type CatalogAnalysisResult = {
  categories: ProposedCategory[];
  productAssignments: Array<{ productId: string; categorySlug: string; isPrimary: boolean }>;
};

// Example for a snowboard shop — your output must mirror this structure but use terms,
// facet keys, and language specific to the actual category you detect from the catalog.
// Up to 7 facets per category; only include facets you can populate with real catalog terms.
const FACET_CONFIG_SCHEMA = `{
  "version": 1,
  "productNoun": "snowboard",
  "facets": [
    {
      "key": "product_type",
      "label": "Board type",
      "terms": ["snowboard", "splitboard", "powder board", "park board", "all-mountain board", "freestyle snowboard"],
      "matchWeight": 4,
      "extractInKeyword": true
    },
    {
      "key": "terrain",
      "label": "Terrain",
      "terms": ["park", "powder", "all-mountain", "halfpipe", "backcountry", "groomer"],
      "matchWeight": 3,
      "extractInKeyword": true
    },
    {
      "key": "audience",
      "label": "Rider level",
      "terms": ["beginner", "intermediate", "advanced", "kids", "women", "mens"],
      "matchWeight": 2,
      "extractInKeyword": true
    },
    {
      "key": "size",
      "label": "Board size",
      "terms": ["140cm", "145cm", "150cm", "155cm", "158cm", "160cm", "162cm", "165cm"],
      "matchWeight": 2,
      "extractInKeyword": true
    },
    {
      "key": "attribute",
      "label": "Shape / flex",
      "terms": ["rocker", "camber", "flat", "twin", "directional", "stiff", "soft", "medium flex"],
      "matchWeight": 2,
      "extractInKeyword": true
    },
    {
      "key": "material",
      "label": "Construction",
      "terms": ["carbon", "fiberglass", "wood core", "poplar", "bamboo"],
      "matchWeight": 1,
      "extractInKeyword": false
    },
    {
      "key": "color",
      "label": "Color",
      "terms": ["black", "white", "blue", "red", "green", "grey"],
      "matchWeight": 1,
      "extractInKeyword": false
    }
  ],
  "negativeSignals": [
    { "whenFacet": "audience", "value": "kids", "penalizeTerms": ["pro model", "adult"] }
  ],
  "discovery": {
    "stopWords": ["the", "and", "for", "with", "new", "sale", "shop", "best", "buy"],
    "requireAnyTerms": ["snowboard", "splitboard"],
    "appendProductNoun": true,
    "productNoun": "snowboard"
  },
  "cannibalizationKeys": ["product_type", "terrain", "audience"]
}`;

// The persona and userPromptTemplate must be written for the specific product category
// you detected (e.g. furniture, skincare, running shoes) — not as a generic template.
// Use only the facet keys you defined in facetConfig as placeholders in userPromptTemplate.
const PROMPT_CONFIG_SCHEMA = `{
  "persona": "You are a snowboard and winter sports SEO expert for a Shopify store. Return ONLY valid JSON matching the output schema. No markdown fences or extra text. H1 must match the target keyword exactly. The first 100 words of intro must declare the page topic clearly. Each H2/H3 must expand topical depth (buying guide, use cases, comparisons) without restating H1. FAQ answers must be standalone. Use locale-appropriate terminology and currency from LOCALE.",
  "userPromptTemplate": "Create an SEO product listing page for {product_type} — target keyword: {keyword}.\\nTARGET KEYWORD: {keyword}\\nINTENT: {intent_json}\\nPRODUCTS: {products_json}\\nLOCALE: {locale_json}\\nBRAND TONE: {brand_tone}\\nRELATED PLPS: {related_plps_json}\\nKEY ATTRIBUTES: product_type={product_type}, terrain={terrain}, audience={audience}, attribute={attribute}\\n\\n- h1: exact target keyword\\n- intro: 80-120 words, states topic in first sentence, highlights product range\\n- sections: min 3 — buying guide, top picks by terrain/audience, sizing or care tips; reference product names from PRODUCTS\\n- faq: min 4 common buyer questions for this keyword\\n- meta_title: max 60 chars, lead with keyword\\n- meta_description: 150-160 chars, keyword-first and benefit-driven\\n- product_alt_texts: SEO alt text keyed by product id\\n- internal_links: slugs from RELATED PLPS with descriptive anchor text",
  "temperature": 0.45
}`;

function sampleProducts(products: CatalogProduct[], max = 80): CatalogProduct[] {
  if (products.length <= max) return products;
  const step = Math.floor(products.length / max);
  return products.filter((_, i) => i % step === 0).slice(0, max);
}

function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * AI proposes categories (with facetConfig + promptConfig) and product assignments.
 */
export async function analyzeCatalogWithAi(
  products: CatalogProduct[],
): Promise<CatalogAnalysisResult> {
  const sample = sampleProducts(products);
  const catalogSummary = sample.map((p) => ({
    id: p.id,
    title: p.title,
    productType: p.productType,
    tags: p.tags.slice(0, 8),
    collections: p.collections.slice(0, 5),
    description: p.description.slice(0, 120),
  }));

  const raw = await completeJson(
    [
      {
        role: "system",
        content: `You analyze e-commerce product catalogs and define SEO PLP categories for a Shopify store. Return JSON only.

Response shape:
{
  "categories": [
    {
      "slug": "lowercase-hyphenated",
      "name": "Display Name",
      "confidence": 0.0-1.0,
      "signals": ["why this category exists"],
      "facetConfig": ${FACET_CONFIG_SCHEMA},
      "promptConfig": ${PROMPT_CONFIG_SCHEMA}
    }
  ],
  "productAssignments": [{ "productId": "gid", "categorySlug": "slug", "isPrimary": true }]
}

Rules:
- Identify ALL distinct product lines in the catalog (e.g. snowboards vs bindings vs apparel). Minimum 1, maximum 8 categories. Create a separate category for every distinct product type even if it has only 1-3 products — do not absorb minority product types into a larger category.
- IMPORTANT: many Shopify products have an empty productType field. Use the product title as the primary classification signal in that case. Infer the product domain from title patterns, tags, and collections when productType is missing.

facetConfig (one per category, specific to that product line):
- productNoun: singular noun for this specific product (e.g. "chair", "serum", "trail shoe") — never "product".
- facets: generate up to 7 facets tailored to the detected product domain. Mine ALL terms exhaustively from product titles, productTypes (if present), tags, and collections — do not invent terms absent from the data. Only include a facet if you can populate it with real terms. Common facet dimensions by domain (use as a guide, not a rigid template):
  • Snowboards / boards: product_type, terrain, audience, size, attribute, material, color
  • Apparel / clothing: product_type, gender, size, color, material, style, use_case
  • Footwear: product_type, gender, size, color, terrain, activity, material
  • Cosmetics / skincare: product_type, skin_type, concern, ingredient, finish, use_case, audience
  • Furniture / home décor: product_type, room, style, material, color, size, use_case
  • Wallpaper: product_type, style, room, color, material, audience, use_case
  • Electronics / tech: product_type, brand, compatibility, color, size, feature, use_case
  For any other domain, choose the most search-relevant dimensions you can extract from the catalog data.
- matchWeight: 4 for the main product-type facet, 3 for key differentiators (terrain, style, use_case), 2 for secondary attributes and size/audience, 1 for color/material/broad terms.
- extractInKeyword: true for facets that commonly appear in search queries (product_type, terrain, style, use_case, audience, size); false for purely visual attributes (color, material) unless they are a primary search driver for this category.
- discovery.requireAnyTerms: include the product nouns that distinguish this category from others (used to filter search keywords).
- discovery.appendProductNoun: set true if keywords for this category typically omit the product noun.
- cannibalizationKeys: list facet keys (matchWeight ≥ 2) that identify near-duplicate PLPs.

promptConfig (one per category, written for that specific product domain):
- persona: name the exact product category and niche (e.g. "You are a trail running shoe and outdoor footwear SEO expert"). Include instructions to return ONLY valid JSON, H1 must match keyword exactly, first 100 words of intro declare the topic, H2/H3 sections expand depth without restating H1, FAQ answers are standalone, use locale currency and terminology.
- userPromptTemplate: MUST include {keyword}, {intent_json}, {products_json}, {locale_json}, {brand_tone}, {related_plps_json}. MUST include placeholders for the main facet keys you defined (e.g. {product_type}, {audience}, {terrain}). MUST specify content requirements: h1=exact keyword, intro 80-120 words, min 3 sections (buying guide + use-case/audience picks + category-specific tips), min 4 FAQ entries, meta_title ≤60 chars keyword-first, meta_description 150-160 chars benefit-driven, product_alt_texts keyed by id, internal_links from related PLPs.
- temperature: 0.4–0.5.

- Assign every sample product to exactly one primary category slug.
- Use only productIds from the user payload.`,
      },
      {
        role: "user",
        content: JSON.stringify({ productCount: products.length, sample: catalogSummary }),
      },
    ],
    { temperature: 0.35, maxTokens: 8192 },
  );

  const parsed = JSON.parse(raw) as {
    categories?: Array<Record<string, unknown>>;
    productAssignments?: CatalogAnalysisResult["productAssignments"];
  };

  if (!parsed.categories?.length) {
    return buildFallbackAnalysis(sample, products.length);
  }

  const categories: ProposedCategory[] = parsed.categories.map((c) => {
    const slug = normalizeSlug(String(c.slug ?? c.name ?? "catalog"));
    const name = String(c.name ?? slug);
    const facetConfig = normalizeFacetConfig(c.facetConfig, { slug, name });
    const facetKeys = facetConfig.facets.map((f) => f.key);
    const promptConfig = normalizePromptConfig(c.promptConfig, { name, facetKeys });
    return {
      slug,
      name,
      confidence: Math.min(1, Math.max(0, Number(c.confidence ?? 0.8))),
      signals: Array.isArray(c.signals) ? c.signals.map(String) : [],
      facetConfig,
      promptConfig,
    };
  });

  const validSlugs = new Set(categories.map((c) => c.slug));
  const assignments = (parsed.productAssignments ?? []).filter(
    (a) => validSlugs.has(normalizeSlug(a.categorySlug)) && sample.some((p) => p.id === a.productId),
  );

  if (assignments.length === 0) {
    const fallbackSlug = categories[0]!.slug;
    return {
      categories,
      productAssignments: sample.map((p) => ({
        productId: p.id,
        categorySlug: fallbackSlug,
        isPrimary: true,
      })),
    };
  }

  return { categories, productAssignments: assignments };
}

function buildFallbackAnalysis(
  sample: CatalogProduct[],
  productCount: number,
): CatalogAnalysisResult {
  const slug = "catalog";
  const name = "Store catalog";
  const facetConfig = normalizeFacetConfig(null, { slug, name });
  const promptConfig = normalizePromptConfig(null, {
    name,
    facetKeys: facetConfig.facets.map((f) => f.key),
  });
  return {
    categories: [
      {
        slug,
        name,
        confidence: 1,
        signals: [`fallback: ${productCount} products`],
        facetConfig,
        promptConfig,
      },
    ],
    productAssignments: sample.map((p) => ({
      productId: p.id,
      categorySlug: slug,
      isPrimary: true,
    })),
  };
}

/**
 * Persist analysis: create/update categories and assign products.
 */
export async function applyCatalogAnalysis(
  shop: string,
  analysis: CatalogAnalysisResult,
): Promise<{ categoryIds: Record<string, string>; assigned: number }> {
  const categoryIds: Record<string, string> = {};

  for (const proposed of analysis.categories) {
    const row = await prisma.shopCategory.upsert({
      where: { shop_slug: { shop, slug: proposed.slug } },
      create: {
        shop,
        slug: proposed.slug,
        name: proposed.name,
        status: proposed.confidence >= 0.5 ? "active" : "draft",
        source: "ai_generated",
        facetConfig: serializeFacetConfig(proposed.facetConfig),
        promptConfig: serializePromptConfig(proposed.promptConfig),
      },
      update: {
        name: proposed.name,
        status: proposed.confidence >= 0.5 ? "active" : undefined,
        facetConfig: serializeFacetConfig(proposed.facetConfig),
        promptConfig: serializePromptConfig(proposed.promptConfig),
        source: "ai_generated",
      },
    });
    categoryIds[proposed.slug] = row.id;
  }

  let assigned = 0;
  const byCategory = new Map<string, Array<{ productId: string; isPrimary: boolean }>>();
  for (const a of analysis.productAssignments) {
    const slug = normalizeSlug(a.categorySlug);
    const catId = categoryIds[slug];
    if (!catId) continue;
    const list = byCategory.get(catId) ?? [];
    list.push({ productId: a.productId, isPrimary: a.isPrimary });
    byCategory.set(catId, list);
  }

  for (const [categoryId, items] of byCategory) {
    assigned += await assignProductsToCategory(shop, categoryId, items);
  }

  await prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, catalogAnalyzedAt: new Date() },
    update: { catalogAnalyzedAt: new Date() },
  });

  return { categoryIds, assigned };
}
