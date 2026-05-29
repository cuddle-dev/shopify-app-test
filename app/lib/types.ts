export type ParsedIntent = {
  raw: string;
  color?: string;
  style?: string;
  attribute?: string;
  use_case?: string;
  room?: string;
  audience?: string;
  material?: string;
  locale_terms?: Record<string, string>;
  tokens: string[];
};

export type PlpStatus = "draft" | "needs_review" | "published" | "blocked";

export type KeywordStatus = "pending" | "approved" | "rejected";

export type PageTypeConfig = {
  id: string;
  slug: string;
  category: string;
  meta: { title: string; description: string };
  seo: {
    title_template: string;
    description_template: string;
    keywords_template: string[];
  };
  generation: {
    temperature: number;
    section_count: number;
    system_prompt: string;
    user_prompt_template: string;
  };
  output_schema: Record<string, unknown>;
};

export type LocaleMarketConfig = {
  id: string;
  language: string;
  region: string;
  currency: string;
  currencySymbol: string;
  measurementSystem: "imperial" | "metric";
  urlPrefix: string;
  hreflang: string;
  terminology: Record<string, string>;
  promptContext: string;
};

export type MatchedProduct = {
  id: string;
  title: string;
  handle: string;
  tags: string[];
  description: string;
  collections: string[];
  imageUrl?: string;
  price?: string;
  currency?: string;
  score: number;
};

export type GeneratedPlpContent = {
  h1: string;
  intro: string;
  sections: Array<{ heading: string; body: string }>;
  faq: Array<{ question: string; answer: string }>;
  schema_markup: Record<string, unknown>;
  meta_title?: string;
  meta_description?: string;
  product_alt_texts?: Record<string, string>;
  internal_links?: Array<{ slug: string; anchor: string; localeId: string }>;
};

export type CatalogProduct = {
  id: string;
  title: string;
  handle: string;
  tags: string[];
  description: string;
  productType?: string;
  vendor?: string;
  collections: string[];
  imageUrl?: string;
  price?: string;
};
