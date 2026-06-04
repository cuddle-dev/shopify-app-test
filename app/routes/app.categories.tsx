import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Banner,
  Text,
  DataTable,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { runCatalogAnalysis, countProductsPerCategory } from "../lib/category/service.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.findUnique({ where: { shop: session.shop } });
  const categories = await prisma.shopCategory.findMany({
    where: { shop: session.shop },
    orderBy: { name: "asc" },
  });
  const productCounts = await countProductsPerCategory(session.shop);
  const rows = categories.map((c) => [
    c.name,
    c.slug,
    c.status,
    c.source,
    String(productCounts[c.id] ?? 0),
    String(c.facetConfig ? JSON.parse(c.facetConfig).facets?.length ?? 0 : 0),
  ]);
  return {
    rows,
    categoryCount: categories.length,
    catalogAnalyzedAt: settings?.catalogAnalyzedAt?.toISOString() ?? null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "analyze") {
    try {
      const result = await runCatalogAnalysis(session.shop, admin);
      return {
        ok: true,
        message: `Analyzed ${result.catalogSize} products → ${result.categories} categories (AI facet & prompt configs), ${result.assigned} product assignments.`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Catalog analysis failed",
      };
    }
  }

  if (intent === "activate" && form.get("categoryId")) {
    await prisma.shopCategory.update({
      where: { id: String(form.get("categoryId")), shop: session.shop },
      data: { status: "active" },
    });
    return { ok: true, message: "Category activated." };
  }

  return { ok: false, message: "Unknown action" };
};

export default function CategoriesPage() {
  const { rows, categoryCount, catalogAnalyzedAt } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <Page>
      <TitleBar title="Categories" />
      <BlockStack gap="500">
        {actionData?.message && (
          <Banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</Banner>
        )}
        {categoryCount === 0 && (
          <Banner tone="warning">
            No categories yet. Run catalog analysis to let AI define categories, facet configs, and
            prompts from your Shopify products.
          </Banner>
        )}
        <Banner tone="info">
          Catalog analysis uses AI to create categories, facetConfig (matching terms), and
          promptConfig (PLP generation) per product line. Re-run after major catalog changes.
          {catalogAnalyzedAt ? ` Last analyzed: ${new Date(catalogAnalyzedAt).toLocaleString()}.` : ""}
        </Banner>
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Catalog analysis
                </Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="analyze" />
                  <Button submit fullWidth loading={nav.state !== "idle"} variant="primary">
                    Analyze catalog (AI)
                  </Button>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "numeric", "numeric"]}
                headings={["Name", "Slug", "Status", "Source", "Products", "Facets"]}
                rows={rows}
              />
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
