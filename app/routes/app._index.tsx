import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Button,
  BlockStack,
  Text,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { publishPlp } from "../lib/plp/service.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const plps = await prisma.plpPage.findMany({
    where: { shop: session.shop },
    include: { keyword: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const counts = await prisma.plpPage.groupBy({
    by: ["status"],
    where: { shop: session.shop },
    _count: true,
  });
  return { plps, counts, shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "publish" && form.get("plpId")) {
    await publishPlp(session.shop, String(form.get("plpId")), admin, session.shop);
    return { ok: true };
  }
  return { ok: false };
};

function statusBadge(status: string) {
  const tone =
    status === "published"
      ? "success"
      : status === "needs_review"
        ? "warning"
        : status === "blocked"
          ? "critical"
          : "info";
  return <Badge tone={tone}>{status.replace("_", " ")}</Badge>;
}

export default function Dashboard() {
  const { plps, counts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const rows = plps.map((p) => [
    p.keyword.rawKeyword,
    p.localeId,
    String(p.productCount),
    statusBadge(p.status),
    p.slug,
    p.status === "draft" && p.productCount >= 6 ? (
      <fetcher.Form method="post" key={p.id}>
        <input type="hidden" name="intent" value="publish" />
        <input type="hidden" name="plpId" value={p.id} />
        <Button submit size="slim" loading={fetcher.state !== "idle"}>
          Publish
        </Button>
      </fetcher.Form>
    ) : (
      <Button url={`/app/plp/${p.id}`} size="slim">
        View
      </Button>
    ),
  ]);

  return (
    <Page>
      <TitleBar title="PLP SEO Generator" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Overview
                </Text>
                <InlineStack gap="400">
                  {counts.map((c) => (
                    <Text key={c.status} as="span" variant="bodyMd">
                      {c.status}: {c._count}
                    </Text>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <DataTable
                columnContentTypes={["text", "text", "numeric", "text", "text", "text"]}
                headings={["Keyword", "Locale", "Products", "Status", "Slug", "Actions"]}
                rows={rows}
              />
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
