import prisma from "../../db.server";
import type { CatalogProduct } from "../types";
import type { ProductFilterRules } from "./types";

export async function getProductIdsForCategory(
  shop: string,
  categoryId: string,
): Promise<Set<string>> {
  const rows = await prisma.productCategory.findMany({
    where: { shop, categoryId },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}

function matchesFilter(product: CatalogProduct, filter: ProductFilterRules): boolean {
  if (filter.productTypes?.length) {
    const pt = (product.productType ?? "").toLowerCase();
    if (filter.productTypes.some((t) => pt.includes(t.toLowerCase()))) return true;
  }
  if (filter.collectionHandles?.length) {
    const cols = product.collections.map((c) => c.toLowerCase());
    if (filter.collectionHandles.some((h) => cols.some((c) => c.includes(h.toLowerCase())))) {
      return true;
    }
  }
  if (filter.tagPrefixes?.length) {
    const tags = product.tags.map((t) => t.toLowerCase());
    if (filter.tagPrefixes.some((p) => tags.some((t) => t.startsWith(p.toLowerCase())))) {
      return true;
    }
  }
  return false;
}

export function filterCatalogByCategory(
  catalog: CatalogProduct[],
  assignedIds: Set<string>,
  productFilter: ProductFilterRules | null,
): CatalogProduct[] {
  if (assignedIds.size > 0) {
    return catalog.filter((p) => assignedIds.has(p.id));
  }
  if (productFilter) {
    const matched = catalog.filter((p) => matchesFilter(p, productFilter));
    if (matched.length > 0) return matched;
  }
  return catalog;
}

export async function assignProductsToCategory(
  shop: string,
  categoryId: string,
  assignments: Array<{ productId: string; isPrimary?: boolean }>,
): Promise<number> {
  await prisma.productCategory.deleteMany({ where: { shop, categoryId } });
  if (assignments.length === 0) return 0;

  await prisma.productCategory.createMany({
    data: assignments.map((a) => ({
      shop,
      productId: a.productId,
      categoryId,
      isPrimary: a.isPrimary ?? true,
    })),
  });
  return assignments.length;
}
