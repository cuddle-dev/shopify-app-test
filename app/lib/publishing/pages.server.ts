import { renderPlpHtml } from "../seo/render-page";
import type { GeneratedPlpContent, MatchedProduct, ParsedIntent } from "../types";
import { getLocaleConfig } from "../../../config/locales";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

const PAGE_CREATE = `#graphql
  mutation CreatePlpPage($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle title }
      userErrors { field message }
    }
  }
`;

const PAGE_UPDATE = `#graphql
  mutation UpdatePlpPage($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle title }
      userErrors { field message }
    }
  }
`;

export async function publishPlpToShopify(params: {
  admin: AdminGraphql;
  shopDomain: string;
  slug: string;
  localeId: string;
  title: string;
  content: GeneratedPlpContent;
  products: MatchedProduct[];
  intent: ParsedIntent;
  status: "published" | "draft";
  existingPageId?: string | null;
  hreflangLocales: string[];
  canonicalLocaleId?: string;
}): Promise<{ pageId: string; pageUrl: string }> {
  const locale = getLocaleConfig(params.localeId);
  const prefix = process.env.PLP_URL_PREFIX ?? "/pages/plp";
  const pageUrl = `https://${params.shopDomain}${locale.urlPrefix}${prefix}/${params.slug}`;

  const bodyHtml = renderPlpHtml({
    content: params.content,
    products: params.products,
    intent: params.intent,
    localeId: params.localeId,
    slug: params.slug,
    pageUrl,
    status: params.status,
    hreflangLocales: params.hreflangLocales,
    canonicalLocaleId: params.canonicalLocaleId,
    productAltTexts: params.content.product_alt_texts,
  });

  const handle = `${locale.id}-${params.slug}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const published = params.status === "published";

  if (params.existingPageId) {
    const res = await params.admin.graphql(PAGE_UPDATE, {
      variables: {
        id: params.existingPageId,
        page: {
          title: params.title,
          body: bodyHtml,
          isPublished: published,
        },
      },
    });
    const json = await res.json();
    const page = json.data?.pageUpdate?.page;
    if (!page) throw new Error(JSON.stringify(json.data?.pageUpdate?.userErrors));
    return { pageId: page.id, pageUrl: `https://${params.shopDomain}/pages/${page.handle}` };
  }

  const res = await params.admin.graphql(PAGE_CREATE, {
    variables: {
      page: {
        title: params.title,
        handle,
        body: bodyHtml,
        isPublished: published,
      },
    },
  });
  const json = await res.json();
  const page = json.data?.pageCreate?.page;
  if (!page) throw new Error(JSON.stringify(json.data?.pageCreate?.userErrors));
  return { pageId: page.id, pageUrl: `https://${params.shopDomain}/pages/${page.handle}` };
}
