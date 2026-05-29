import type { CatalogProduct } from "../types";

const PRODUCTS_QUERY = `#graphql
  query PlpCatalogProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          tags
          description
          productType
          vendor
          featuredImage { url }
          priceRangeV2 {
            minVariantPrice { amount currencyCode }
          }
          collections(first: 10) {
            edges { node { title handle } }
          }
        }
      }
    }
  }
`;

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export async function fetchShopCatalog(
  admin: AdminGraphql,
  maxProducts = 250,
): Promise<CatalogProduct[]> {
  const products: CatalogProduct[] = [];
  let after: string | null = null;
  const pageSize = 50;

  while (products.length < maxProducts) {
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first: pageSize, after },
    });
    const json = await response.json();
    const connection = json.data?.products;
    if (!connection) break;

    for (const edge of connection.edges) {
      const node = edge.node;
      products.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        tags: node.tags ?? [],
        description: node.description ?? "",
        productType: node.productType,
        vendor: node.vendor,
        collections: (node.collections?.edges ?? []).map(
          (c: { node: { title: string } }) => c.node.title,
        ),
        imageUrl: node.featuredImage?.url,
        price: node.priceRangeV2?.minVariantPrice?.amount,
      });
    }

    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }

  return products;
}
