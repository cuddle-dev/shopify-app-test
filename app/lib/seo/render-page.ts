import { getLocaleConfig, getHreflangAlternates } from "../../../config/locales";
import { buildJsonLdStack } from "./jsonld";
import type { GeneratedPlpContent, MatchedProduct, ParsedIntent } from "../types";

export function renderPlpHtml(params: {
  content: GeneratedPlpContent;
  products: MatchedProduct[];
  intent: ParsedIntent;
  localeId: string;
  slug: string;
  pageUrl: string;
  status: string;
  hreflangLocales: string[];
  canonicalLocaleId?: string;
  productAltTexts?: Record<string, string>;
}): string {
  const locale = getLocaleConfig(params.localeId);
  const noindex =
    params.status !== "published" ? '<meta name="robots" content="noindex,nofollow">' : "";

  const alternates = getHreflangAlternates(params.hreflangLocales)
    .map((alt) => {
      const href = `${params.pageUrl.replace(locale.urlPrefix, alt.urlPrefix)}`.replace(
        /\/+/g,
        "/",
      );
      return `<link rel="alternate" hreflang="${alt.hreflang}" href="${href}" />`;
    })
    .join("\n");

  const canonical =
    params.canonicalLocaleId && params.canonicalLocaleId !== params.localeId
      ? params.pageUrl.replace(locale.urlPrefix, getLocaleConfig(params.canonicalLocaleId).urlPrefix)
      : params.pageUrl;

  const jsonLd = buildJsonLdStack({
    pageUrl: params.pageUrl,
    intent: params.intent,
    content: params.content,
    products: params.products,
    localeId: params.localeId,
  });

  const productCards = params.products
    .map(
      (p) => `
    <article class="plp-product" data-product-id="${p.id}">
      ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${escapeHtml(params.productAltTexts?.[p.id] ?? p.title)}" loading="lazy" />` : ""}
      <h3>${escapeHtml(p.title)}</h3>
      ${p.price ? `<p class="price">${locale.currencySymbol}${p.price} ${locale.currency}</p>` : ""}
      <a href="/products/${p.handle}">View product</a>
    </article>`,
    )
    .join("");

  const sections = params.content.sections
    .map(
      (s) => `<section><h2>${escapeHtml(s.heading)}</h2><div>${escapeHtml(s.body)}</div></section>`,
    )
    .join("");

  const faq = params.content.faq
    .map(
      (f) =>
        `<details itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <summary itemprop="name">${escapeHtml(f.question)}</summary>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <p itemprop="text">${escapeHtml(f.answer)}</p>
      </div>
    </details>`,
    )
    .join("");

  const internalLinks = (params.content.internal_links ?? [])
    .map(
      (l) =>
        `<a href="${locale.urlPrefix}/pages/plp/${l.slug}" class="plp-related">${escapeHtml(l.anchor)}</a>`,
    )
    .join(" · ");

  return `<!DOCTYPE html>
<html lang="${locale.language}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(params.content.meta_title ?? params.content.h1)}</title>
  <meta name="description" content="${escapeHtml(params.content.meta_description ?? "")}" />
  <link rel="canonical" href="${canonical}" />
  ${alternates}
  ${noindex}
  ${jsonLd.map((g) => `<script type="application/ld+json">${JSON.stringify(g)}</script>`).join("\n")}
</head>
<body class="plp-page" data-locale="${params.localeId}">
  <nav aria-label="Breadcrumb"><a href="/">Home</a> / ${escapeHtml(params.content.h1)}</nav>
  <header><h1>${escapeHtml(params.content.h1)}</h1></header>
  <div class="plp-intro">${escapeHtml(params.content.intro)}</div>
  ${sections}
  <section class="plp-products"><h2>Featured products</h2><div class="plp-grid">${productCards}</div></section>
  <section class="plp-faq"><h2>FAQ</h2>${faq}</section>
  ${internalLinks ? `<nav class="plp-related-nav"><h2>Related guides</h2>${internalLinks}</nav>` : ""}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
