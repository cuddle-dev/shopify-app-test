import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Box, Link } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { buildAiPresenceFiles } from "../lib/plp/service.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const files = await buildAiPresenceFiles(session.shop, session.shop);
  return { ...files, shop: session.shop };
};

export default function AiPresencePage() {
  const { llmsTxt, sitemapAi, shop } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="AI presence" />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              These files update when PLPs are published. Expose via app proxy or theme redirect to
              your app URL:
            </Text>
            <Link url={`/llms.txt?shop=${shop}`} target="_blank">
              /llms.txt
            </Link>
            <Link url={`/sitemap-ai.xml?shop=${shop}`} target="_blank">
              /sitemap-ai.xml
            </Link>
            <Text as="h2" variant="headingMd">
              llms.txt preview
            </Text>
            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>{llmsTxt}</pre>
            </Box>
            <Text as="h2" variant="headingMd">
              sitemap-ai.xml preview
            </Text>
            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <pre style={{ margin: 0, fontSize: 11, maxHeight: 300, overflow: "auto" }}>{sitemapAi}</pre>
            </Box>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
