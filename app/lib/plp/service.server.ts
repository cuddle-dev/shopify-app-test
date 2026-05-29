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
  const catalog = await fetchShopCatalog(admin);
  const discovered = discoverKeywordsFromCatalog(catalog, localeId);
  const clusters = clusterKeywords(discovered.map((d) => d.keyword));

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
    await prisma.keyword.upsert({
      where: { shop_rawKeyword_localeId: { shop, rawKeyword: keyword, localeId } },
      create: {
        shop,
        rawKeyword: keyword,
        source: "auto",
        clusterId: cluster.clusterId,
        localeId,
        status: "pending",
      },
      update: { clusterId: cluster.clusterId },
    });
  }

  return { discovered: discovered.length, clusters: clusters.length };
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
  options?: { pageTypeId?: string; manualProductIds?: string[] },
) {
  const settings = await getOrCreateShopSettings(shop);
  const keyword = await prisma.keyword.findFirstOrThrow({
    where: { id: keywordId, shop },
    include: { plp: true },
  });

  const intent = await parseKeywordIntent(keyword.rawKeyword, keyword.localeId);
  await prisma.keyword.update({
    where: { id: keyword.id },
    data: { parsedIntent: JSON.stringify(intent), status: "approved" },
  });

  const published = await prisma.plpPage.findMany({
    where: { shop, status: "published" },
    select: { intentJson: true },
  });
  const existingIntents = published.map((p) => JSON.parse(p.intentJson) as ParsedIntent);
  const similarity = isTooSimilar(intent, existingIntents, settings.similarityThreshold);

  const catalog = await fetchShopCatalog(admin);
  const manualIds = options?.manualProductIds
    ? options.manualProductIds
    : keyword.plp?.manualProductIds
      ? (JSON.parse(keyword.plp.manualProductIds) as string[])
      : undefined;

  const { products, belowThreshold } = matchProducts(catalog, intent, {
    minCount: settings.minProductCount,
    manualIds,
  });

  const pageTypeId = options?.pageTypeId ?? keyword.pageTypeId ?? "style-room";
  const slug = slugify(keyword.rawKeyword);

  const linkCandidates = await prisma.plpPage.findMany({
    where: { shop, status: "published" },
    select: { id: true, slug: true, localeId: true, keyword: { select: { rawKeyword: true } }, intentJson: true },
  });

  const related = computeInternalLinks(
    { id: "new", intent, localeId: keyword.localeId },
    linkCandidates.map((p) => ({
      id: p.id,
      slug: p.slug,
      localeId: p.localeId,
      keyword: p.keyword.rawKeyword,
      intentJson: p.intentJson,
    })),
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
      productCount: products.length,
      productIds: JSON.stringify(products.map((p) => p.id)),
      contentJson: JSON.stringify(content),
      metaTitle: content.meta_title,
      metaDescription: content.meta_description,
      similarityScore: similarity.score,
    },
  });

  return { plp, products, belowThreshold, similarity };
}

export async function publishPlp(shop: string, plpId: string, admin: AdminGraphql, shopDomain: string) {
  const plp = await prisma.plpPage.findFirstOrThrow({ where: { id: plpId, shop }, include: { keyword: true } });
  if (plp.status === "needs_review" || plp.productCount < 6) {
    throw new Error("Cannot publish: below minimum product threshold or needs review");
  }
  if (plp.status === "blocked") {
    throw new Error("Cannot publish: blocked due to cannibalization similarity");
  }

  const content = JSON.parse(plp.contentJson!);
  const intent = JSON.parse(plp.intentJson);
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
