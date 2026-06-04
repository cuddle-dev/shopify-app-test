import prisma from "../../db.server";
import { fetchShopCatalog } from "../catalog/fetch-products.server";
import { clusterKeywords } from "../keywords/clustering";
import { discoverKeywordsFromCatalog } from "../keywords/discovery";
import { parseKeywordCsv, parseKeywordPaste } from "../keywords/import";
import { generatePlpContent } from "../generation/pipeline";
import { parseKeywordIntent } from "../intent/parser";
import { matchProducts } from "../matching/matcher";
import { publishPlpToShopify } from "../publishing/pages.server";
import { isTooSimilar } from "../seo/cannibalization";
import { computeInternalLinks } from "../seo/internal-links";
import { generateLlmsTxt } from "../ai-presence/llms-txt";
import { generateSitemapAiXml } from "../ai-presence/sitemap-ai";
import type { ParsedIntent } from "../types";
import { listLocaleIds } from "../../../config/locales";
import { hasActiveCategories } from "../category/service.server";
import { getCatalogForCategory, resolveCategoryForIntent } from "../category/service.server";
import { getCannibalizationKeys, normalizeParsedIntent } from "../category/intent";
import { listActiveCategories } from "../category/seed";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

function slugify(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function getOrCreateShopSettings(shop: string) {
  return prisma.shopSettings.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
}

export async function runAutoDiscovery(shop: string, admin: AdminGraphql, localeId: string) {
  if (!(await hasActiveCategories(shop))) {
    throw new Error("No categories configured. Run Catalog analysis on the Categories page first.");
  }
  const catalog = await fetchShopCatalog(admin);
  const categories = await listActiveCategories(shop);
  const allDiscovered: Array<{ keyword: string; source: "auto"; score: number; categoryId: string }> =
    [];

  for (const category of categories) {
    const scoped = await getCatalogForCategory(shop, category, catalog);
    if (scoped.length === 0) continue;
    const discovered = discoverKeywordsFromCatalog(scoped, category.facetConfig);
    for (const d of discovered) {
      allDiscovered.push({ ...d, categoryId: category.id });
    }
  }

  const clusters = clusterKeywords(allDiscovered.map((d) => d.keyword));
  const keywordToCategory = new Map(
    allDiscovered.map((d) => [d.keyword.toLowerCase(), d.categoryId]),
  );

  for (const cluster of clusters) {
    await prisma.keywordCluster.upsert({
      where: { id: `${shop}_${cluster.clusterId}_${localeId}` },
      create: {
        id: `${shop}_${cluster.clusterId}_${localeId}`,
        shop,
        canonicalKeyword: cluster.canonicalKeyword,
        memberKeywords: JSON.stringify(cluster.members),
        localeId,
      },
      update: {
        memberKeywords: JSON.stringify(cluster.members),
      },
    });

    const keyword = cluster.canonicalKeyword;
    const categoryId = keywordToCategory.get(keyword.toLowerCase()) ?? null;
    await prisma.keyword.upsert({
      where: { shop_rawKeyword_localeId: { shop, rawKeyword: keyword, localeId } },
      create: {
        shop,
        rawKeyword: keyword,
        source: "auto",
        clusterId: cluster.clusterId,
        localeId,
        status: "pending",
        categoryId,
      },
      update: { clusterId: cluster.clusterId, categoryId: categoryId ?? undefined },
    });
  }

  return { discovered: allDiscovered.length, clusters: clusters.length };
}

export async function importKeywords(
  shop: string,
  input: { csv?: string; paste?: string; localeId: string },
) {
  const keywords = [
    ...(input.csv ? parseKeywordCsv(input.csv) : []),
    ...(input.paste ? parseKeywordPaste(input.paste) : []),
  ];
  const clusters = clusterKeywords(keywords);

  for (const cluster of clusters) {
    await prisma.keyword.upsert({
      where: {
        shop_rawKeyword_localeId: {
          shop,
          rawKeyword: cluster.canonicalKeyword,
          localeId: input.localeId,
        },
      },
      create: {
        shop,
        rawKeyword: cluster.canonicalKeyword,
        source: input.csv ? "csv" : "manual",
        clusterId: cluster.clusterId,
        localeId: input.localeId,
        status: "pending",
      },
      update: {},
    });
  }
  return { imported: keywords.length, canonical: clusters.length };
}

export async function approveAndGeneratePlp(
  shop: string,
  keywordId: string,
  admin: AdminGraphql,
  options?: { pageTypeId?: string; manualProductIds?: string[]; categoryId?: string },
) {
  const settings = await getOrCreateShopSettings(shop);
  const keyword = await prisma.keyword.findFirstOrThrow({
    where: { id: keywordId, shop },
    include: { plp: true },
  });

  const categoryId = options?.categoryId ?? keyword.categoryId ?? undefined;
  const intent = await parseKeywordIntent(keyword.rawKeyword, keyword.localeId, {
    shop,
    categoryId,
  });

  const category = await resolveCategoryForIntent(shop, intent.categoryId);

  await prisma.keyword.update({
    where: { id: keyword.id },
    data: {
      parsedIntent: JSON.stringify(intent),
      status: "approved",
      categoryId: category.id,
    },
  });

  const published = await prisma.plpPage.findMany({
    where: { shop, status: "published" },
    select: { intentJson: true, categoryId: true },
  });
  const existingIntents = published.map((p) =>
    normalizeParsedIntent(JSON.parse(p.intentJson)),
  );
  const similarity = isTooSimilar(
    intent,
    existingIntents,
    settings.similarityThreshold,
    getCannibalizationKeys(category.facetConfig),
  );

  const fullCatalog = await fetchShopCatalog(admin);
  const catalog = await getCatalogForCategory(shop, category, fullCatalog);

  const manualIds = options?.manualProductIds
    ? options.manualProductIds
    : keyword.plp?.manualProductIds
      ? (JSON.parse(keyword.plp.manualProductIds) as string[])
      : undefined;

  const { products, belowThreshold } = matchProducts(catalog, intent, category.facetConfig, {
    minCount: settings.minProductCount,
    manualIds,
  });

  const pageTypeId = options?.pageTypeId ?? keyword.pageTypeId ?? settings.defaultPageTypeId ?? "style-room";
  const slug = slugify(keyword.rawKeyword);

  const linkCandidates = await prisma.plpPage.findMany({
    where: { shop, status: "published" },
    select: {
      id: true,
      slug: true,
      localeId: true,
      categoryId: true,
      keyword: { select: { rawKeyword: true } },
      intentJson: true,
    },
  });

  const related = computeInternalLinks(
    { id: "new", intent, localeId: keyword.localeId },
    linkCandidates.map((p) => ({
      id: p.id,
      slug: p.slug,
      localeId: p.localeId,
      categoryId: p.categoryId,
      keyword: p.keyword.rawKeyword,
      intentJson: p.intentJson,
    })),
    category.facetConfig,
  );

  let status: "draft" | "needs_review" | "blocked" = belowThreshold
    ? "needs_review"
    : similarity.blocked
      ? "blocked"
      : "draft";

  const { content } = await generatePlpContent({
    keyword: keyword.rawKeyword,
    intent,
    products,
    localeId: keyword.localeId,
    pageTypeId,
    brandTone: settings.brandTone,
    promptConfig: category.promptConfig,
    relatedPlps: related.map((r) => ({
      slug: r.slug,
      keyword: r.anchor,
      localeId: r.localeId,
    })),
  });

  content.internal_links = related;

  const plp = await prisma.plpPage.upsert({
    where: { keywordId: keyword.id },
    create: {
      shop,
      keywordId: keyword.id,
      pageTypeId,
      categoryId: category.id,
      localeId: keyword.localeId,
      slug,
      status,
      productCount: products.length,
      productIds: JSON.stringify(products.map((p) => p.id)),
      intentJson: JSON.stringify(intent),
      contentJson: JSON.stringify(content),
      metaTitle: content.meta_title,
      metaDescription: content.meta_description,
      similarityScore: similarity.score,
      manualProductIds: manualIds ? JSON.stringify(manualIds) : null,
    },
    update: {
      status,
      categoryId: category.id,
      productCount: products.length,
      productIds: JSON.stringify(products.map((p) => p.id)),
      contentJson: JSON.stringify(content),
      metaTitle: content.meta_title,
      metaDescription: content.meta_description,
      similarityScore: similarity.score,
    },
  });

  return { plp, products, belowThreshold, similarity, category };
}

/** Re-fetch catalog and update stored product matches without regenerating AI content. */
export async function refreshPlpMatches(
  shop: string,
  plpId: string,
  admin: AdminGraphql,
) {
  const settings = await getOrCreateShopSettings(shop);
  const plp = await prisma.plpPage.findFirstOrThrow({
    where: { id: plpId, shop },
  });

  const intent = normalizeParsedIntent(JSON.parse(plp.intentJson));
  const category = await resolveCategoryForIntent(shop, plp.categoryId ?? intent.categoryId);

  const fullCatalog = await fetchShopCatalog(admin);
  const catalog = await getCatalogForCategory(shop, category, fullCatalog);

  const manualIds = plp.manualProductIds
    ? (JSON.parse(plp.manualProductIds) as string[])
    : undefined;

  const { products, belowThreshold } = matchProducts(catalog, intent, category.facetConfig, {
    minCount: settings.minProductCount,
    manualIds,
  });

  let status = plp.status;
  if (plp.status !== "published" && plp.status !== "blocked") {
    status = belowThreshold ? "needs_review" : "draft";
  }

  const updated = await prisma.plpPage.update({
    where: { id: plp.id },
    data: {
      productCount: products.length,
      productIds: JSON.stringify(products.map((p) => p.id)),
      status,
      categoryId: category.id,
    },
  });

  return { plp: updated, products, belowThreshold, minProductCount: settings.minProductCount };
}

export async function publishPlp(shop: string, plpId: string, admin: AdminGraphql, shopDomain: string) {
  const settings = await getOrCreateShopSettings(shop);
  const plp = await prisma.plpPage.findFirstOrThrow({ where: { id: plpId, shop }, include: { keyword: true } });
  if (plp.status === "needs_review" || plp.productCount < settings.minProductCount) {
    throw new Error("Cannot publish: below minimum product threshold or needs review");
  }
  if (plp.status === "blocked") {
    throw new Error("Cannot publish: blocked due to cannibalization similarity");
  }

  const content = JSON.parse(plp.contentJson!);
  const intent = normalizeParsedIntent(JSON.parse(plp.intentJson));
  const productIds = JSON.parse(plp.productIds ?? "[]") as string[];
  const catalog = await fetchShopCatalog(admin);
  const products = catalog
    .filter((p) => productIds.includes(p.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      tags: p.tags,
      description: p.description,
      collections: p.collections,
      imageUrl: p.imageUrl,
      price: p.price,
      score: 1,
    }));

  const locales = listLocaleIds();
  const { pageId, pageUrl } = await publishPlpToShopify({
    admin,
    shopDomain,
    slug: plp.slug,
    localeId: plp.localeId,
    title: content.h1,
    content,
    products,
    intent,
    status: "published",
    existingPageId: plp.shopifyPageId,
    hreflangLocales: locales,
    canonicalLocaleId: plp.canonicalLocaleId ?? undefined,
  });

  return prisma.plpPage.update({
    where: { id: plp.id },
    data: {
      status: "published",
      shopifyPageId: pageId,
      shopifyPageUrl: pageUrl,
      publishedAt: new Date(),
    },
  });
}

export async function buildAiPresenceFiles(shop: string, shopDomain: string) {
  const published = await prisma.plpPage.findMany({
    where: { shop, status: "published" },
    include: { keyword: true },
  });

  const plpEntries = published.map((p) => ({
    slug: p.slug,
    localeId: p.localeId,
    keyword: p.keyword.rawKeyword,
    intentSummary: p.intentJson,
    productCount: p.productCount,
    url: p.shopifyPageUrl ?? `https://${shopDomain}/pages/${p.slug}`,
  }));

  const llmsTxt = generateLlmsTxt({
    shopName: shop,
    collections: [],
    plps: plpEntries,
  });

  const sitemapAi = generateSitemapAiXml(
    published.map((p) => ({
      loc: p.shopifyPageUrl ?? `https://${shopDomain}/pages/${p.slug}`,
      lastmod: (p.publishedAt ?? p.updatedAt).toISOString().split("T")[0],
      keyword: p.keyword.rawKeyword,
      intentSummary: p.intentJson.slice(0, 200),
      productCount: p.productCount,
      localeId: p.localeId,
    })),
  );

  return { llmsTxt, sitemapAi };
}
