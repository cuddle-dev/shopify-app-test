export type FacetDefinition = {
  key: string;
  label: string;
  terms: string[];
  matchWeight: number;
  extractInKeyword: boolean;
};

export type NegativeSignal = {
  whenFacet: string;
  value: string;
  penalizeTerms: string[];
};

export type DiscoveryConfig = {
  stopWords: string[];
  requireAnyTerms: string[];
  appendProductNoun: boolean;
  productNoun: string;
};

export type FacetConfig = {
  version: number;
  productNoun: string;
  facets: FacetDefinition[];
  negativeSignals: NegativeSignal[];
  discovery: DiscoveryConfig;
  cannibalizationKeys: string[];
};

export type CategoryPromptConfig = {
  persona: string;
  userPromptTemplate: string;
  temperature: number;
};

export type ProductFilterRules = {
  collectionHandles?: string[];
  productTypes?: string[];
  tagPrefixes?: string[];
};

export type ShopCategoryRecord = {
  id: string;
  shop: string;
  slug: string;
  name: string;
  status: string;
  facetConfig: FacetConfig;
  promptConfig: CategoryPromptConfig;
  productFilter: ProductFilterRules | null;
};
