import type { FacetConfig, CategoryPromptConfig, ProductFilterRules } from "./types";

export function parseFacetConfig(json: string): FacetConfig {
  return JSON.parse(json) as FacetConfig;
}

export function parsePromptConfig(json: string): CategoryPromptConfig {
  return JSON.parse(json) as CategoryPromptConfig;
}

export function parseProductFilter(json: string | null | undefined): ProductFilterRules | null {
  if (!json) return null;
  return JSON.parse(json) as ProductFilterRules;
}

export function serializeFacetConfig(config: FacetConfig): string {
  return JSON.stringify(config);
}

export function serializePromptConfig(config: CategoryPromptConfig): string {
  return JSON.stringify(config);
}
