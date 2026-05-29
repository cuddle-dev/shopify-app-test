import type { GeneratedPlpContent, MatchedProduct, ParsedIntent } from "../types";
import { getLocaleConfig } from "../../../config/locales";

export function buildJsonLdStack(params: {
  pageUrl: string;
  intent: ParsedIntent;
  content: GeneratedPlpContent;
  products: MatchedProduct[];
  localeId: string;
  breadcrumbLabels?: string[];
}): Record<string, unknown>[] {
  const locale = getLocaleConfig(params.localeId);
  const items = params.products.map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `${params.pageUrl}#product-${p.handle}`,
    item: {
      "@type": "Product",
      name: p.title,
      image: p.imageUrl,
      offers: p.price
        ? {
            "@type": "Offer",
            price: p.price,
            priceCurrency: locale.currency,
          }
        : undefined,
    },
  }));

  const collectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: params.content.h1,
    description: params.content.intro.slice(0, 300),
    url: params.pageUrl,
    inLanguage: locale.hreflang,
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items,
    numberOfItems: items.length,
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: params.content.faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: (params.breadcrumbLabels ?? ["Home", params.content.h1]).map(
      (name, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name,
        item: i === 0 ? "/" : params.pageUrl,
      }),
    ),
  };

  return [collectionPage, itemList, faqPage, breadcrumb];
}
