import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
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
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { fetchShopCatalog } from "../lib/catalog/fetch-products.server";
import { matchProducts } from "../lib/matching/matcher";
import type { ParsedIntent } from "../lib/types";
import { getOrCreateShopSettings, publishPlp, refreshPlpMatches } from "../lib/plp/service.server";

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
  const settings = await getOrCreateShopSettings(session.shop);
  return { plp, products, content, intent, minProductCount: settings.minProductCount };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  if (!params.id) return { ok: false };

  if (form.get("intent") === "publish") {
    await publishPlp(session.shop, params.id, admin, session.shop);
    return { ok: true, intent: "publish" };
  }

  if (form.get("intent") === "refresh_matches") {
    const { plp, belowThreshold, minProductCount } = await refreshPlpMatches(
      session.shop,
      params.id,
      admin,
    );
    return {
      ok: true,
      intent: "refresh_matches",
      productCount: plp.productCount,
      status: plp.status,
      belowThreshold,
      minProductCount,
    };
  }

  return { ok: false };
};

export default function PlpDetailPage() {
  const { plp, products, content, intent, minProductCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const isSubmitting = nav.state !== "idle";
  const refreshSubmitting =
    isSubmitting && nav.formData?.get("intent") === "refresh_matches";
  const publishSubmitting = isSubmitting && nav.formData?.get("intent") === "publish";
  const canRefresh = plp.status !== "published" && plp.status !== "blocked";
  const canPublish =
    plp.status === "draft" && plp.productCount >= minProductCount;

  return (
    <Page
      backAction={{ url: "/app" }}
      title={plp.keyword.rawKeyword}
      primaryAction={
        canPublish ? (
          <Form method="post">
            <input type="hidden" name="intent" value="publish" />
            <Button submit variant="primary" loading={publishSubmitting}>
              Publish to Shopify
            </Button>
          </Form>
        ) : undefined
      }
    >
      <TitleBar title={plp.keyword.rawKeyword} />
      <BlockStack gap="500">
        {actionData?.ok &&
          "intent" in actionData &&
          actionData.intent === "refresh_matches" &&
          "belowThreshold" in actionData && (
            <Banner tone={actionData.belowThreshold ? "warning" : "success"}>
              {actionData.belowThreshold
                ? `Refreshed: ${actionData.productCount}/${actionData.minProductCount} products matched. Still under review.`
                : `Refreshed: ${actionData.productCount} products matched. Status is now ${actionData.status.replace("_", " ")} — you can publish when ready.`}
            </Banner>
          )}
        {plp.status === "needs_review" && (
          <Banner tone="warning">
            Below minimum product threshold ({plp.productCount}/{minProductCount}). Add or tag
            products in Shopify, then use Refresh product matches to update this PLP.
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
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Product match preview
                  </Text>
                  {canRefresh && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="refresh_matches" />
                      <Button submit loading={refreshSubmitting}>
                        Refresh product matches
                      </Button>
                    </Form>
                  )}
                </InlineStack>
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
