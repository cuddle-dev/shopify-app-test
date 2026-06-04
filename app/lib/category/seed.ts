import prisma from "../../db.server";
import type { ShopCategoryRecord } from "./types";

function toRecord(row: {
  id: string;
  shop: string;
  slug: string;
  name: string;
  status: string;
  facetConfig: string;
  promptConfig: string;
  productFilter: string | null;
}): ShopCategoryRecord {
  return {
    id: row.id,
    shop: row.shop,
    slug: row.slug,
    name: row.name,
    status: row.status,
    facetConfig: JSON.parse(row.facetConfig),
    promptConfig: JSON.parse(row.promptConfig),
    productFilter: row.productFilter ? JSON.parse(row.productFilter) : null,
  };
}

export async function listActiveCategories(shop: string): Promise<ShopCategoryRecord[]> {
  const rows = await prisma.shopCategory.findMany({
    where: { shop, status: "active" },
    orderBy: { name: "asc" },
  });
  return rows.map(toRecord);
}

export async function hasActiveCategories(shop: string): Promise<boolean> {
  const count = await prisma.shopCategory.count({ where: { shop, status: "active" } });
  return count > 0;
}

export async function getCategoryById(
  shop: string,
  categoryId: string,
): Promise<ShopCategoryRecord | null> {
  const row = await prisma.shopCategory.findFirst({ where: { id: categoryId, shop } });
  return row ? toRecord(row) : null;
}

export async function getCategoryBySlug(
  shop: string,
  slug: string,
): Promise<ShopCategoryRecord | null> {
  const row = await prisma.shopCategory.findFirst({ where: { shop, slug } });
  return row ? toRecord(row) : null;
}
