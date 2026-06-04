import prisma from "../../db.server";
import { fetchShopCatalog } from "../catalog/fetch-products.server";
import { analyzeCatalogWithAi, applyCatalogAnalysis } from "./analyzer";
import { listActiveCategories, getCategoryById, hasActiveCategories } from "./seed";
import { getProductIdsForCategory, filterCatalogByCategory } from "./products";
import type { ShopCategoryRecord } from "./types";
import type { CatalogProduct } from "../types";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export async function getShopCategories(shop: string) {
  return listActiveCategories(shop);
}

export async function runCatalogAnalysis(shop: string, admin: AdminGraphql) {
  const catalog = await fetchShopCatalog(admin);
  if (catalog.length === 0) {
    throw new Error("Catalog is empty. Add products in Shopify first.");
  }
  const analysis = await analyzeCatalogWithAi(catalog);
  const result = await applyCatalogAnalysis(shop, analysis);
  return {
    catalogSize: catalog.length,
    categories: analysis.categories.length,
    assigned: result.assigned,
  };
}

export async function activateCategory(shop: string, categoryId: string) {
  return prisma.shopCategory.update({
    where: { id: categoryId, shop },
    data: { status: "active" },
  });
}

export async function getCatalogForCategory(
  shop: string,
  category: ShopCategoryRecord,
  catalog: CatalogProduct[],
): Promise<CatalogProduct[]> {
  const assignedIds = await getProductIdsForCategory(shop, category.id);
  return filterCatalogByCategory(catalog, assignedIds, category.productFilter);
}

export async function resolveCategoryForIntent(
  shop: string,
  categoryId: string | null | undefined,
): Promise<ShopCategoryRecord> {
  if (categoryId) {
    const cat = await getCategoryById(shop, categoryId);
    if (cat) return cat;
  }
  const categories = await listActiveCategories(shop);
  if (categories.length === 0) {
    throw new Error("No categories configured. Run Catalog analysis on the Categories page first.");
  }
  return categories[0];
}

export async function listAllCategories(shop: string) {
  const rows = await prisma.shopCategory.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    source: row.source,
    facetConfig: JSON.parse(row.facetConfig),
    productCount: 0,
  }));
}

export async function countProductsPerCategory(shop: string) {
  const counts = await prisma.productCategory.groupBy({
    by: ["categoryId"],
    where: { shop },
    _count: true,
  });
  return Object.fromEntries(counts.map((c) => [c.categoryId, c._count]));
}

export { hasActiveCategories };
