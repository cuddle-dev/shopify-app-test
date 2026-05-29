import type { LoaderFunctionArgs } from "@remix-run/node";
import { buildAiPresenceFiles } from "../lib/plp/service.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return new Response("Missing shop query parameter", { status: 400 });
  }
  const { sitemapAi } = await buildAiPresenceFiles(shop, shop);
  return new Response(sitemapAi, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
