import type { ActionFunctionArgs, LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  BlockStack,
  Text,
  DataTable,
  Banner,
  InlineStack,
} from "@shopify/polaris";
import { useState } from "react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { listLocaleIds } from "../../config/locales";
import {
  runAutoDiscovery,
  importKeywords,
  approveAndGeneratePlp,
} from "../lib/plp/service.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const keywords = await prisma.keyword.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { plp: true },
  });
  return { keywords, locales: listLocaleIds() };
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin, redirect } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const localeId = String(form.get("localeId") ?? "en-us");

  if (intent === "discover") {
    const result = await runAutoDiscovery(session.shop, admin, localeId);
    return { ok: true, message: `Discovered ${result.discovered} signals, ${result.clusters} clusters.` };
  }

  if (intent === "import") {
    const result = await importKeywords(session.shop, {
      csv: String(form.get("csv") ?? ""),
      paste: String(form.get("paste") ?? ""),
      localeId,
    });
    return {
      ok: true,
      message: `Imported ${result.imported} keywords → ${result.canonical} canonical clusters.`,
    };
  }

  if (intent === "approve" && form.get("keywordId")) {
    try {
      const { plp } = await approveAndGeneratePlp(
        session.shop,
        String(form.get("keywordId")),
        admin,
      );
      // Redirect avoids revalidating this page after a long LLM request (tunnel timeout → "Failed to fetch")
      return redirect(`/app/plp/${plp.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      return { ok: false, message };
    }
  }

  if (intent === "reject" && form.get("keywordId")) {
    await prisma.keyword.update({
      where: { id: String(form.get("keywordId")) },
      data: { status: "rejected" },
    });
    return { ok: true, message: "Keyword rejected." };
  }

  return { ok: false, message: "Unknown action" };
};

export default function KeywordsPage() {
  const { keywords, locales } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const approveFetcher = useFetcher<typeof action>();
  const ApproveForm = approveFetcher.Form;
  const nav = useNavigation();
  const isApproving =
    approveFetcher.state !== "idle" &&
    approveFetcher.formData?.get("intent") === "approve";
  const [localeId, setLocaleId] = useState("en-us");
  const [paste, setPaste] = useState("");
  const [csv, setCsv] = useState("");

  const localeOptions = locales.map((l) => ({ label: l, value: l }));

  const rows = keywords.map((k) => {
    const intent = k.parsedIntent ? JSON.parse(k.parsedIntent) : null;
    return [
      k.rawKeyword,
      k.localeId,
      k.source,
      k.status,
      intent ? JSON.stringify(intent) : "—",
      k.status === "pending" ? (
        <InlineStack gap="200" key={k.id}>
          <ApproveForm method="post">
            <input type="hidden" name="intent" value="approve" />
            <input type="hidden" name="keywordId" value={k.id} />
            <Button submit size="slim" loading={isApproving}>
              Approve & generate
            </Button>
          </ApproveForm>
          <Form method="post">
            <input type="hidden" name="intent" value="reject" />
            <input type="hidden" name="keywordId" value={k.id} />
            <Button submit size="slim" tone="critical">
              Reject
            </Button>
          </Form>
        </InlineStack>
      ) : k.plp ? (
        <Button url={`/app/plp/${k.plp.id}`} size="slim">
          View PLP
        </Button>
      ) : (
        "—"
      ),
    ];
  });

  return (
    <Page>
      <TitleBar title="Keyword manager" />
      <BlockStack gap="500">
        {actionData?.message && (
          <Banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</Banner>
        )}
        {approveFetcher.data && "message" in approveFetcher.data && !approveFetcher.data.ok && (
          <Banner tone="critical">{approveFetcher.data.message}</Banner>
        )}
        {isApproving && (
          <Banner tone="info">
            Generating PLP content (AI + product matching). This can take 30–90 seconds…
          </Banner>
        )}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Ingest keywords
                </Text>
                <Select label="Locale" options={localeOptions} value={localeId} onChange={setLocaleId} />
                <Form method="post">
                  <input type="hidden" name="intent" value="discover" />
                  <input type="hidden" name="localeId" value={localeId} />
                  <Button submit fullWidth loading={nav.state !== "idle"}>
                    Auto-discover from catalog
                  </Button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="import" />
                  <input type="hidden" name="localeId" value={localeId} />
                  <TextField label="CSV (one keyword per line)" value={csv} onChange={setCsv} multiline={4} name="csv" autoComplete="off" />
                  <TextField label="Manual paste" value={paste} onChange={setPaste} multiline={4} name="paste" autoComplete="off" />
                  <Button submit fullWidth>Import keywords</Button>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                headings={["Keyword", "Locale", "Source", "Status", "Parsed intent", "Actions"]}
                rows={rows}
              />
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
