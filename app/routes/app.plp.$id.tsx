import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Banner,
  Button,
  Box,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { fetchShopCatalog } from "../lib/catalog/fetch-products.server";
import { matchProducts } from "../lib/matching/matcher";
import type { ParsedIntent } from "../lib/types";
import { publishPlp } from "../lib/plp/service.server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const plp = await prisma.plpPage.findFirstOrThrow({
    where: { id: params.id, shop: session.shop },
    include: { keyword: true },
  });
  const intent = JSON.parse(plp.intentJson) as ParsedIntent;
  const catalog = await fetchShopCatalog(admin);
  const manualIds = plp.manualProductIds
    ? (JSON.parse(plp.manualProductIds) as string[])
    : undefined;
  const { products } = matchProducts(catalog, intent, { manualIds });
  const content = plp.contentJson ? JSON.parse(plp.contentJson) : null;
  return { plp, products, content, intent };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("intent") === "publish" && params.id) {
    await publishPlp(session.shop, params.id, admin, session.shop);
    return { ok: true };
  }
  return { ok: false };
};

export default function PlpDetailPage() {
  const { plp, products, content, intent } = useLoaderData<typeof loader>();
  const nav = useNavigation();

  return (
    <Page
      backAction={{ url: "/app" }}
      title={plp.keyword.rawKeyword}
      primaryAction={
        plp.status === "draft" && plp.productCount >= 6 ? (
          <Form method="post">
            <input type="hidden" name="intent" value="publish" />
            <Button submit variant="primary" loading={nav.state !== "idle"}>
              Publish to Shopify
            </Button>
          </Form>
        ) : undefined
      }
    >
      <TitleBar title={plp.keyword.rawKeyword} />
      <BlockStack gap="500">
        {plp.status === "needs_review" && (
          <Banner tone="warning">
            Below minimum product threshold ({plp.productCount}/6). Not publishable until adjusted.
          </Banner>
        )}
        {plp.status === "blocked" && (
          <Banner tone="critical">
            Blocked: intent too similar to existing PLP (score {plp.similarityScore?.toFixed(2)}).
          </Banner>
        )}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Product match preview
                </Text>
                <List type="bullet">
                  {products.map((p) => (
                    <List.Item key={p.id}>
                      {p.title} (score {p.score.toFixed(1)})
                    </List.Item>
                  ))}
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Parsed intent
                </Text>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(intent, null, 2)}</pre>
                </Box>
                {content && (
                  <>
                    <Text as="h2" variant="headingMd">
                      Generated content
                    </Text>
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <pre style={{ margin: 0, fontSize: 12, maxHeight: 400, overflow: "auto" }}>
                        {JSON.stringify(content, null, 2)}
                      </pre>
                    </Box>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
