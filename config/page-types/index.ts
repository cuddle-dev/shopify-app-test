import type { PageTypeConfig } from "../../app/lib/types";
import styleRoom from "./style-room.json";
import useCase from "./use-case.json";

const pageTypes: Record<string, PageTypeConfig> = {
  "style-room": styleRoom as PageTypeConfig,
  "use-case": useCase as PageTypeConfig,
};

export function getPageTypeConfig(id: string): PageTypeConfig {
  const config = pageTypes[id];
  if (!config) {
    throw new Error(`Unknown page type "${id}". Add config/page-types/{id}.json`);
  }
  return config;
}

export function listPageTypeIds(): string[] {
  return Object.keys(pageTypes);
}

export default pageTypes;
